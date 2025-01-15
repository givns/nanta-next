// services/Attendance/AttendanceProcessingService.ts

import {
  PrismaClient,
  Prisma,
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
  TimeEntryStatus,
} from '@prisma/client';
import {
  ProcessingOptions,
  ProcessingResult,
  AttendanceRecord,
  AppError,
  ErrorCode,
  ShiftWindowResponse,
  GeoLocationJson,
  GeoLocation,
  StatusUpdateResult,
} from '../../types/attendance';
import { getCurrentTime } from '../../utils/dateUtils';
import {
  startOfDay,
  endOfDay,
  parseISO,
  isWithinInterval,
  subMinutes,
  addMinutes,
  differenceInMinutes,
  format,
} from 'date-fns';

// Import services
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { TimeEntryService } from '../TimeEntryService';

// Import utils
import { AttendanceMappers } from './utils/AttendanceMappers';
import { AttendanceEnhancementService } from './AttendanceEnhancementService';
import { PeriodManagementService } from './PeriodManagementService';
import { StatusHelpers } from './utils/StatusHelper';
import { cacheService } from '../cache/CacheService';

export class AttendanceProcessingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly shiftService: ShiftManagementService,
    private readonly periodManager: PeriodManagementService,
    private readonly timeEntryService: TimeEntryService,
    private readonly enhancementService: AttendanceEnhancementService,
  ) {}

  private validateAndNormalizeOptions(
    options: ProcessingOptions,
  ): ProcessingOptions {
    // Ensure overtime status matches period type
    const isOvertimePeriod = options.periodType === PeriodType.OVERTIME;

    return {
      ...options,
      activity: {
        ...options.activity,
        isOvertime: isOvertimePeriod,
      },
    };
  }

  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    const now = getCurrentTime();
    const normalizedOptions = this.validateAndNormalizeOptions(options);

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const [currentRecord, window] = await Promise.all([
            this.getLatestAttendance(tx, options.employeeId),
            this.shiftService.getCurrentWindow(options.employeeId, now),
          ]);

          if (!window) {
            throw new AppError({
              code: ErrorCode.SHIFT_DATA_ERROR,
              message: 'Shift configuration not found',
            });
          }

          // Get previous state before processing
          const previousState = currentRecord
            ? this.periodManager.resolveCurrentPeriod(
                currentRecord,
                window,
                now,
              )
            : undefined;

          // Only use autocompletion when actually handling missing entries
          const shouldAutoComplete =
            normalizedOptions.activity.overtimeMissed &&
            // Case 1: Trying to check in regular but overtime checkout is missing
            ((normalizedOptions.periodType === PeriodType.REGULAR &&
              currentRecord?.type === PeriodType.OVERTIME &&
              !currentRecord.CheckOutTime) ||
              // Case 2: Missing regular checkin when trying to checkout
              (normalizedOptions.activity.isCheckIn === false &&
                !currentRecord?.CheckInTime));

          if (shouldAutoComplete) {
            return this.handleAutoCompletion(
              tx,
              currentRecord,
              window,
              normalizedOptions,
              now,
            );
          }

          // Process main attendance record
          const processedAttendance = await this.processAttendanceRecord(
            tx,
            currentRecord,
            window,
            options,
            now,
          );

          // Create proper StatusUpdateResult for TimeEntryService
          const timeEntryStatusUpdate = this.createStatusUpdateFromProcessing(
            normalizedOptions,
            currentRecord,
            now,
          );

          // Process time entries with proper status update
          const timeEntries = await this.timeEntryService.processTimeEntries(
            tx,
            processedAttendance,
            timeEntryStatusUpdate,
            normalizedOptions,
          );

          const currentState = this.periodManager.resolveCurrentPeriod(
            processedAttendance,
            window,
            now,
          );

          // Create state validation
          const stateValidation =
            await this.enhancementService.createStateValidation(
              processedAttendance,
              currentState,
              window,
              now,
            );

          const processingResult: ProcessingResult = {
            success: true,
            timestamp: now.toISOString(),
            data: {
              state: {
                current: currentState,
                previous: previousState,
              },
              validation: stateValidation,
            },
            metadata: {
              source: options.activity.isManualEntry
                ? 'manual'
                : ('system' as const),
              timeEntries,
            },
          };

          return processingResult;
        },
        {
          timeout: 15000, // Increase timeout to 15 seconds for auto-completion
          maxWait: 20000, // Maximum time to wait for transaction to start
        },
      );

      await cacheService.set(`forceRefresh:${options.employeeId}`, 'true', 30);

      return result;
    } catch (error) {
      console.error('Attendance processing error:', error);
      throw this.handleProcessingError(error);
    }
  }

  private async handleAutoCompletion(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord | null,
    window: ShiftWindowResponse,
    options: ProcessingOptions,
    now: Date,
  ): Promise<ProcessingResult> {
    // Validate current state
    if (!currentRecord?.CheckInTime || currentRecord?.CheckOutTime) {
      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: 'Invalid state for auto-completion',
      });
    }

    try {
      // Handle based on period type
      if (currentRecord.type === PeriodType.OVERTIME) {
        // Get overtime end time from record's timeWindow
        const overtimeEndDate = parseISO(window.current.end);

        // Update attendance record
        const updatedAttendance = await tx.attendance.update({
          where: { id: currentRecord.id },
          data: {
            CheckOutTime: overtimeEndDate,
            state: AttendanceState.PRESENT,
            checkStatus: CheckStatus.CHECKED_OUT,
            overtimeState: OvertimeState.COMPLETED,
            metadata: {
              update: {
                source: 'auto',
                updatedAt: now,
              },
            },
          },
          include: {
            timeEntries: true,
            overtimeEntries: true,
            location: true,
            metadata: true,
            checkTiming: true,
          },
        });

        // Create new overtime time entry
        await tx.timeEntry.create({
          data: {
            employeeId: currentRecord.employeeId,
            date: startOfDay(now),
            attendanceId: currentRecord.id,
            startTime: currentRecord.CheckInTime,
            endTime: overtimeEndDate,
            status: 'COMPLETED',
            entryType: PeriodType.OVERTIME,
            regularHours: 0,
            overtimeHours:
              differenceInMinutes(overtimeEndDate, currentRecord.CheckInTime) /
              60,
            hours: {
              regular: 0,
              overtime:
                differenceInMinutes(
                  overtimeEndDate,
                  currentRecord.CheckInTime,
                ) / 60,
            },
            timing: {
              actualMinutesLate: 0,
              isHalfDayLate: false,
            },
            ...(options.metadata?.overtimeId && {
              overtimeRequestId: options.metadata.overtimeId,
            }),
            metadata: {
              source: 'auto',
              version: 1,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
          },
        });

        const currentState = this.periodManager.resolveCurrentPeriod(
          AttendanceMappers.toAttendanceRecord(updatedAttendance),
          window,
          now,
        );

        const stateValidation =
          await this.enhancementService.createStateValidation(
            AttendanceMappers.toAttendanceRecord(updatedAttendance),
            currentState,
            window,
            now,
          );

        return {
          success: true,
          timestamp: now.toISOString(),
          data: {
            state: {
              current: currentState,
              previous: this.periodManager.resolveCurrentPeriod(
                currentRecord,
                window,
                now,
              ),
            },
            validation: stateValidation,
          },
          metadata: {
            source: 'auto',
            timeEntries: [],
            isTransition: false,
          },
        };
      } else {
        // Regular period handling
        const shiftEndDate = new Date(now);
        const [hours, minutes] = window.shift.endTime.split(':').map(Number);
        shiftEndDate.setHours(hours, minutes, 0, 0);

        const regularCheckout = await tx.attendance.update({
          where: { id: currentRecord.id },
          data: {
            CheckOutTime: shiftEndDate,
            state: AttendanceState.PRESENT,
            checkStatus: CheckStatus.CHECKED_OUT,
            metadata: {
              update: {
                source: 'auto',
                updatedAt: now,
              },
            },
          },
          include: {
            timeEntries: true,
            overtimeEntries: true,
            location: true,
            metadata: true,
            checkTiming: true,
          },
        });

        const regularTimeEntry = await tx.timeEntry.update({
          where: {
            id: currentRecord.timeEntries[0].id,
            attendanceId: currentRecord.id,
            status: 'STARTED',
            entryType: PeriodType.REGULAR,
          },
          data: {
            endTime: shiftEndDate,
            status: 'COMPLETED' as TimeEntryStatus,
            regularHours:
              differenceInMinutes(shiftEndDate, currentRecord.CheckInTime) / 60,
            hours: {
              regular:
                differenceInMinutes(shiftEndDate, currentRecord.CheckInTime) /
                60,
              overtime: 0,
            },
            metadata: {
              source: 'auto',
              version: 1,
              updatedAt: now.toISOString(),
            },
          },
        });

        const overtimeCheckin = await tx.attendance.create({
          data: {
            employeeId: options.employeeId,
            date: startOfDay(now),
            state: AttendanceState.INCOMPLETE,
            checkStatus: CheckStatus.CHECKED_IN,
            type: PeriodType.OVERTIME,
            isOvertime: true,
            overtimeState: OvertimeState.IN_PROGRESS,
            CheckInTime: shiftEndDate,
            shiftStartTime: new Date(window.current.start),
            shiftEndTime: new Date(window.current.end),
            ...(options.metadata?.overtimeId && {
              overtimeId: options.metadata.overtimeId,
            }),
            metadata: {
              create: {
                source: 'auto',
                isManualEntry: false,
                isDayOff: window.isDayOff,
                createdAt: now,
                updatedAt: now,
              },
            },
            checkTiming: {
              create: {
                isEarlyCheckIn: false,
                isLateCheckIn: false,
                isLateCheckOut: false,
                isVeryLateCheckOut: false,
                lateCheckOutMinutes: 0,
              },
            },
          },
          include: {
            timeEntries: true,
            overtimeEntries: true,
            location: true,
            metadata: true,
            checkTiming: true,
          },
        });

        const overtimeTimeEntry = await tx.timeEntry.create({
          data: {
            employeeId: options.employeeId,
            date: startOfDay(now),
            startTime: shiftEndDate,
            status: 'STARTED' as TimeEntryStatus,
            entryType: PeriodType.OVERTIME,
            attendanceId: overtimeCheckin.id,
            regularHours: 0,
            overtimeHours: 0,
            hours: {
              regular: 0,
              overtime: 0,
            },
            timing: {
              actualMinutesLate: 0,
              isHalfDayLate: false,
            },
            ...(options.metadata?.overtimeId && {
              overtimeRequestId: options.metadata.overtimeId,
            }),
            metadata: {
              source: 'auto',
              version: 1,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
          },
        });

        const currentState = this.periodManager.resolveCurrentPeriod(
          AttendanceMappers.toAttendanceRecord(overtimeCheckin),
          window,
          now,
        );

        const stateValidation =
          await this.enhancementService.createStateValidation(
            AttendanceMappers.toAttendanceRecord(overtimeCheckin),
            currentState,
            window,
            now,
          );

        return {
          success: true,
          timestamp: now.toISOString(),
          data: {
            state: {
              current: currentState,
              previous: this.periodManager.resolveCurrentPeriod(
                currentRecord,
                window,
                now,
              ),
            },
            validation: stateValidation,
          },
          metadata: {
            source: 'auto',
            timeEntries: {
              regular: regularTimeEntry,
              overtime: [overtimeTimeEntry],
            },
            isTransition: true,
          },
        };
      }
    } catch (error) {
      console.error('Auto-completion error:', error);
      throw this.handleProcessingError(error);
    }
  }

  private async processAttendanceRecord(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord | null,
    window: ShiftWindowResponse,
    options: ProcessingOptions,
    now: Date,
  ): Promise<AttendanceRecord> {
    const isCheckIn = options.activity.isCheckIn;
    const locationData = options.location
      ? this.prepareLocationData(options, isCheckIn)
      : undefined;

    // Find active record with explicit location include
    const activeRecord = !isCheckIn
      ? await tx.attendance.findFirst({
          where: {
            employeeId: options.employeeId,
            date: startOfDay(now),
            state: AttendanceState.INCOMPLETE,
            type: options.periodType,
            isOvertime: options.periodType === PeriodType.OVERTIME,
            overtimeState:
              options.periodType === PeriodType.OVERTIME
                ? OvertimeState.IN_PROGRESS
                : undefined,
            CheckInTime: { not: null },
          },
          orderBy: {
            CheckInTime: 'desc',
          },
          include: {
            timeEntries: true,
            overtimeEntries: true,
            location: true,
            metadata: true,
            checkTiming: true,
          },
        })
      : null;

    // Handle checkout
    if (!isCheckIn) {
      if (!activeRecord) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: `No active ${options.periodType} period found for checkout.`,
        });
      }

      // Handle location update if provided
      if (options.location) {
        const coordinates = this.prepareLocationJson(
          options.location.coordinates,
        );
        const address = options.location.address;

        if (activeRecord.location) {
          await tx.attendanceLocation.update({
            where: { attendanceId: activeRecord.id },
            data: {
              checkOutCoordinates: coordinates,
              checkOutAddress: address,
            },
          });
        } else {
          await tx.attendanceLocation.create({
            data: {
              attendanceId: activeRecord.id,
              checkOutCoordinates: coordinates,
              checkOutAddress: address,
            },
          });
        }
      }

      // Update attendance record
      const updatedAttendance = await tx.attendance.update({
        where: { id: activeRecord.id },
        data: {
          CheckOutTime: now,
          state: AttendanceState.PRESENT,
          checkStatus: CheckStatus.CHECKED_OUT,
          ...(options.periodType === PeriodType.OVERTIME && {
            overtimeState: OvertimeState.COMPLETED,
            isOvertime: true,
          }),
          metadata: {
            update: {
              source: options.metadata?.source || 'system',
              updatedAt: now,
            },
          },
        },
        include: {
          timeEntries: true,
          overtimeEntries: true,
          location: true,
          metadata: true,
          checkTiming: true,
        },
      });

      return AttendanceMappers.toAttendanceRecord(updatedAttendance)!;
    }

    // Handle check-in
    const latestRecord = await tx.attendance.findFirst({
      where: {
        employeeId: options.employeeId,
        date: startOfDay(now),
        type: options.periodType,
      },
      orderBy: {
        periodSequence: 'desc',
      },
    });

    const nextSequence = latestRecord ? latestRecord.periodSequence + 1 : 1;

    // Create new attendance record
    const attendance = await tx.attendance.create({
      data: {
        user: { connect: { employeeId: options.employeeId } },
        date: startOfDay(now),
        state: AttendanceState.INCOMPLETE,
        checkStatus: CheckStatus.CHECKED_IN,
        type: options.periodType,
        periodSequence: nextSequence,
        isOvertime: options.periodType === PeriodType.OVERTIME,
        overtimeState:
          options.periodType === PeriodType.OVERTIME
            ? OvertimeState.IN_PROGRESS
            : undefined,
        shiftStartTime: parseISO(window.current.start),
        shiftEndTime: parseISO(window.current.end),
        CheckInTime: now,
        ...(options.metadata?.overtimeId && {
          overtimeId: options.metadata.overtimeId,
        }),
        ...(locationData && {
          location: { create: locationData },
        }),
        metadata: {
          create: {
            isManualEntry: options.activity.isManualEntry || false,
            isDayOff: window.isDayOff,
            source: options.metadata?.source || 'system',
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      include: {
        timeEntries: true,
        overtimeEntries: true,
        location: true,
        metadata: true,
        checkTiming: true,
      },
    });

    return AttendanceMappers.toAttendanceRecord(attendance)!;
  }

  private prepareLocationJson(
    location?: GeoLocation,
  ): Prisma.InputJsonValue | undefined {
    if (!location) return undefined;

    const locationJson: GeoLocationJson = {
      lat: location.lat,
      lng: location.lng,
      longitude: location.longitude,
      latitude: location.latitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp?.toISOString(),
      provider: location.provider,
    };

    return locationJson;
  }

  private async getLatestAttendance(
    tx: Prisma.TransactionClient,
    employeeId: string,
    periodType?: PeriodType, // Add optional period type parameter
  ): Promise<AttendanceRecord | null> {
    const record = await tx.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(getCurrentTime()),
          lt: endOfDay(getCurrentTime()),
        },
        ...(periodType && { type: periodType }), // Only filter by type if specified
      },
      orderBy: [{ metadata: { createdAt: 'desc' } }, { id: 'desc' }],
      include: {
        timeEntries: true,
        overtimeEntries: true,
        location: true,
        metadata: true,
      },
    });

    return record ? AttendanceMappers.toAttendanceRecord(record) : null;
  }

  // 2. Fix location data structure
  private prepareLocationData(
    options: ProcessingOptions,
    isCheckIn: boolean,
  ): Omit<Prisma.AttendanceLocationCreateInput, 'attendance'> {
    return {
      checkInCoordinates: isCheckIn
        ? this.prepareLocationJson(options.location?.coordinates)
        : undefined,
      checkInAddress: isCheckIn ? options.location?.address : undefined,
      checkOutCoordinates: !isCheckIn
        ? this.prepareLocationJson(options.location?.coordinates)
        : undefined,
      checkOutAddress: !isCheckIn ? options.location?.address : undefined,
    };
  }

  private createStatusUpdateFromProcessing(
    options: ProcessingOptions,
    currentRecord: AttendanceRecord | null,
    now: Date,
  ): StatusUpdateResult {
    return {
      stateChange: {
        state: {
          previous: currentRecord?.state || AttendanceState.ABSENT,
          current: options.activity.isCheckIn
            ? AttendanceState.INCOMPLETE
            : AttendanceState.PRESENT,
        },
        checkStatus: {
          previous: currentRecord?.checkStatus || CheckStatus.PENDING,
          current: options.activity.isCheckIn
            ? CheckStatus.CHECKED_IN
            : CheckStatus.CHECKED_OUT,
        },
        overtime: options.activity.isOvertime
          ? {
              previous: {
                isOvertime: currentRecord?.isOvertime || false,
                state: currentRecord?.overtimeState,
              },
              current: {
                isOvertime: true,
                state: options.activity.isCheckIn
                  ? OvertimeState.IN_PROGRESS
                  : OvertimeState.COMPLETED,
              },
            }
          : undefined,
      },
      timestamp: now,
      reason:
        options.metadata?.reason ||
        `Regular ${options.activity.isCheckIn ? 'check-in' : 'check-out'}`,
      metadata: {
        source: options.activity.isManualEntry ? 'manual' : 'system',
        location: options.location?.coordinates
          ? {
              latitude: options.location.coordinates.latitude,
              longitude: options.location.coordinates.longitude,
              accuracy: options.location.coordinates.accuracy,
            }
          : undefined,
        updatedBy: options.metadata?.updatedBy || 'system',
      },
    };
  }

  private handleProcessingError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    console.error('Processing error:', error);
    return new AppError({
      code: ErrorCode.PROCESSING_ERROR,
      message:
        error instanceof Error ? error.message : 'Unknown processing error',
      originalError: error,
    });
  }
}

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
    console.log('Normalized options:', {
      original: options,
      normalized: normalizedOptions,
    });

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          // 1. Get current state
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

          // 2. Handle auto-completion if needed
          if (normalizedOptions.activity.overtimeMissed) {
            return this.handleAutoCompletion(
              tx,
              currentRecord,
              window,
              normalizedOptions,
              now,
            );
          }

          // 3. Process regular attendance
          const previousState = currentRecord
            ? this.periodManager.resolveCurrentPeriod(
                currentRecord,
                window,
                now,
              )
            : undefined;

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

          const stateValidation =
            await this.enhancementService.createStateValidation(
              processedAttendance,
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
                previous: previousState,
              },
              validation: stateValidation,
            },
            metadata: {
              source: options.activity.isManualEntry ? 'manual' : 'system',
              timeEntries,
            },
          };
        },
        {
          timeout: 15000, // Increase timeout to 15 seconds for auto-completion
          maxWait: 20000, // Maximum time to wait for transaction to start
        },
      );

      // Only set force refresh after successful transaction
      await cacheService.set(`forceRefresh:${options.employeeId}`, 'true', 30);

      return {
        ...result,
        metadata: {
          ...result.metadata,
          source: 'auto',
        },
      };
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
      // Convert shift end time to proper DateTime
      const shiftEndDate = new Date(now);
      const [hours, minutes] = window.shift.endTime.split(':').map(Number);
      shiftEndDate.setHours(hours, minutes, 0, 0);

      // 1. Regular check-out
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

      // 2. Regular time entry
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
              differenceInMinutes(shiftEndDate, currentRecord.CheckInTime) / 60,
            overtime: 0,
          },
          metadata: {
            source: 'auto',
            version: 1,
            updatedAt: now.toISOString(),
          },
        },
      });

      // 3. Overtime check-in
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

      // 4. Overtime time entry
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

      // 5. Get final state
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

    // Enhanced transition detection
    const shiftEnd = parseISO(window.current.end);
    const isInTransitionWindow = isWithinInterval(now, {
      start: subMinutes(shiftEnd, 15),
      end: addMinutes(shiftEnd, 15),
    });
    const hasUpcomingOvertime = Boolean(
      window.nextPeriod?.type === PeriodType.OVERTIME,
    );

    // Status validation for overtime
    if (options.activity.isOvertime && currentRecord) {
      const currentStatus = {
        state: currentRecord.state,
        checkStatus: currentRecord.checkStatus,
        isOvertime: currentRecord.isOvertime,
        overtimeState: currentRecord.overtimeState,
      };

      if (!StatusHelpers.canTransitionToOvertime(currentStatus)) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: 'Cannot transition to overtime from current state',
        });
      }
    }

    const locationData = options.location
      ? this.prepareLocationData(options, isCheckIn)
      : undefined;

    // Get current sequence for this period type
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

    // Prepare attendance data using correct schema structure
    const attendanceData: Prisma.AttendanceCreateInput = {
      user: { connect: { employeeId: options.employeeId } },
      date: startOfDay(now),
      state: AttendanceState.INCOMPLETE,
      checkStatus: CheckStatus.CHECKED_IN,
      type: options.periodType,
      periodSequence: nextSequence,
      isOvertime: options.activity.isOvertime || false,
      shiftStartTime: parseISO(window.current.start),
      shiftEndTime: parseISO(window.current.end),
      CheckInTime: isCheckIn ? now : undefined,
      CheckOutTime: !isCheckIn ? now : undefined,
      ...(locationData && {
        location: { create: locationData },
      }),
      metadata: {
        create: {
          isManualEntry: options.activity.isManualEntry || false,
          isDayOff: window.isDayOff,
          source:
            hasUpcomingOvertime && isInTransitionWindow
              ? 'auto'
              : options.metadata?.source || 'system',
        },
      },
    };

    // Use schema-compliant update structure with new unique constraint
    const attendance = await tx.attendance.upsert({
      where: {
        employee_date_period_sequence: {
          employeeId: options.employeeId,
          date: startOfDay(now),
          type: options.periodType,
          periodSequence: nextSequence,
        },
      },
      create: attendanceData,
      update: {
        CheckOutTime: !isCheckIn ? now : undefined,
        state: !isCheckIn ? AttendanceState.PRESENT : undefined,
        checkStatus: !isCheckIn ? CheckStatus.CHECKED_OUT : undefined,
        ...(locationData && {
          location: {
            update: {
              checkOutCoordinates: !isCheckIn
                ? this.prepareLocationJson(options.location?.coordinates)
                : undefined,
              checkOutAddress: !isCheckIn
                ? options.location?.address
                : undefined,
            },
          },
        }),
        // Update metadata using the correct schema fields
        ...(hasUpcomingOvertime &&
          isInTransitionWindow && {
            metadata: {
              update: {
                source: 'auto',
                updatedAt: now,
              },
            },
          }),
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

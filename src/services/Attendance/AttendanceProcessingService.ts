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
  TimeEntryHours,
  ValidationContext,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import {
  startOfDay,
  endOfDay,
  parseISO,
  format,
  subDays,
  addHours,
} from 'date-fns';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { TimeEntryService } from '../TimeEntryService';
import { AttendanceMappers } from './utils/AttendanceMappers';
import { AttendanceEnhancementService } from './AttendanceEnhancementService';
import { cacheService } from '../cache/CacheService';
import { PeriodManagementService } from './PeriodManagementService';

type LocationDataInput = {
  checkInCoordinates?: Prisma.InputJsonValue | null;
  checkInAddress?: string | null;
  checkOutCoordinates?: Prisma.InputJsonValue | null;
  checkOutAddress?: string | null;
};

export class AttendanceProcessingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly shiftService: ShiftManagementService,
    private readonly timeEntryService: TimeEntryService,
    private readonly enhancementService: AttendanceEnhancementService,
    private readonly periodManager: PeriodManagementService,
  ) {}

  /**
   * Main entry point for processing attendance
   */
  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    const now = getCurrentTime();
    const validatedOptions = this.validateAndNormalizeOptions(options);

    console.log('Processing attendance request:', {
      type: options.periodType,
      checkTime: options.checkTime,
      serverTime: now.toISOString(),
    });

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          // Get current state information
          const currentRecord = await this.getLatestAttendance(
            tx,
            options.employeeId,
            options.periodType, // Pass the periodType
          );

          // Get effective shift first
          const shiftData = await this.shiftService.getEffectiveShift(
            options.employeeId,
            now,
          );
          if (!shiftData) {
            throw new AppError({
              code: ErrorCode.SHIFT_DATA_ERROR,
              message: 'Shift configuration not found',
            });
          }

          // Get period state from period manager
          const periodState = await this.periodManager.getCurrentPeriodState(
            options.employeeId,
            [currentRecord].filter(Boolean) as AttendanceRecord[],
            now,
          );

          // Transform period state to window response
          const windowResponse: ShiftWindowResponse = {
            current: {
              start: periodState.current.timeWindow.start,
              end: periodState.current.timeWindow.end,
            },
            type: periodState.current.type,
            shift: shiftData.current,
            isHoliday: false,
            isDayOff: !shiftData.current.workDays.includes(now.getDay()),
            isAdjusted: shiftData.isAdjusted,
            overtimeInfo: periodState.overtime || undefined,
          };

          // Check if auto-completion needed
          if (this.shouldAutoComplete(options, currentRecord)) {
            return this.handleAutoCompletion(
              tx,
              currentRecord!,
              windowResponse,
              options,
              now,
            );
          }

          // Process attendance record
          const processedAttendance = await this.processAttendanceRecord(
            tx,
            currentRecord,
            windowResponse,
            options,
            now,
          );

          // Create validation context
          const validationContext: ValidationContext = {
            employeeId: options.employeeId,
            timestamp: now,
            isCheckIn: options.activity.isCheckIn,
            state: processedAttendance.state,
            checkStatus: processedAttendance.checkStatus,
            overtimeState: processedAttendance.overtimeState,
            attendance: processedAttendance,
            shift: shiftData.current,
            periodType: options.periodType,
            isOvertime: options.activity.isOvertime || false,
          };

          // Get enhanced status with validation
          const enhancedStatus =
            await this.enhancementService.enhanceAttendanceStatus(
              AttendanceMappers.toSerializedAttendanceRecord(
                processedAttendance,
              ),
              windowResponse,
              validationContext,
            );

          // Process time entries
          const timeEntries = await this.timeEntryService.processTimeEntries(
            tx,
            processedAttendance,
            this.createStatusUpdateFromProcessing(
              validatedOptions,
              currentRecord,
              now,
            ),
            validatedOptions,
          );

          return {
            success: true,
            timestamp: now.toISOString(),
            data: {
              state: {
                current: enhancedStatus.daily.currentState,
                previous: currentRecord
                  ? enhancedStatus.daily.currentState
                  : undefined,
              },
              validation: enhancedStatus.validation,
            },
            metadata: {
              source: options.activity.isManualEntry ? 'manual' : 'system',
              timeEntries,
            },
          } as ProcessingResult;
        },
        {
          timeout: 15000,
          maxWait: 20000,
        },
      );

      // Invalidate cache
      await cacheService.set(`forceRefresh:${options.employeeId}`, 'true', 30);

      return result;
    } catch (error) {
      console.error('Attendance processing error:', {
        error,
        options: {
          type: options.periodType,
          employeeId: options.employeeId,
        },
      });
      throw this.handleProcessingError(error);
    }
  }

  /**
   * Auto-completion handling
   */
  private async handleAutoCompletion(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord,
    periodState: ShiftWindowResponse,
    options: ProcessingOptions,
    now: Date,
  ): Promise<ProcessingResult> {
    try {
      // Verify we have a record to complete
      if (!currentRecord?.type || !currentRecord.CheckInTime) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: 'Invalid record for auto-completion',
        });
      }

      const completedRecord = await this.completeAttendanceRecord(
        tx,
        currentRecord,
        periodState,
        options,
        now,
      );

      // Create validation context for completed record
      const validationContext: ValidationContext = {
        employeeId: options.employeeId,
        timestamp: now,
        isCheckIn: false,
        state: completedRecord.state,
        checkStatus: completedRecord.checkStatus,
        overtimeState: completedRecord.overtimeState,
        attendance: completedRecord,
        shift: periodState.shift,
        periodType: completedRecord.type,
        isOvertime: completedRecord.type === PeriodType.OVERTIME,
      };

      // Get enhanced status
      const enhancedStatus =
        await this.enhancementService.enhanceAttendanceStatus(
          AttendanceMappers.toSerializedAttendanceRecord(completedRecord),
          periodState,
          validationContext,
        );

      // Create ProcessingResult with proper validation
      return {
        success: true,
        timestamp: now.toISOString(),
        data: {
          state: {
            current: enhancedStatus.daily.currentState,
            previous: enhancedStatus.daily.currentState,
          },
          validation: enhancedStatus.validation,
        },
        metadata: {
          source: 'auto',
          timeEntries: [],
        },
      };
    } catch (error) {
      console.error('Auto-completion error:', error);
      throw this.handleProcessingError(error);
    }
  }

  /**
   * Attendance Record Processing
   */
  private async processAttendanceRecord(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    options: ProcessingOptions,
    now: Date,
  ): Promise<AttendanceRecord> {
    const isCheckIn = options.activity.isCheckIn;

    // Create base location data
    const baseLocationData = options.location
      ? this.createBaseLocationData(options.location, isCheckIn)
      : undefined;

    // Create proper Prisma input type
    const locationData = baseLocationData
      ? {
          ...baseLocationData,
          attendance: {
            connect: {}, // Will be filled in processCheckIn/processCheckOut
          },
        }
      : undefined;

    if (!isCheckIn) {
      return this.processCheckOut(
        tx,
        currentRecord,
        periodState,
        options,
        baseLocationData,
        now,
      );
    }

    return this.processCheckIn(tx, periodState, options, baseLocationData, now);
  }

  private createBaseLocationData(
    location: ProcessingOptions['location'],
    isCheckIn: boolean,
  ): LocationDataInput {
    return {
      checkInCoordinates: isCheckIn
        ? this.prepareLocationJson(location?.coordinates)
        : null,
      checkInAddress: isCheckIn ? location?.address : null,
      checkOutCoordinates: !isCheckIn
        ? this.prepareLocationJson(location?.coordinates)
        : null,
      checkOutAddress: !isCheckIn ? location?.address : null,
    };
  }

  private validateAndNormalizeOptions(
    options: ProcessingOptions,
  ): ProcessingOptions {
    const isOvertimePeriod = options.periodType === PeriodType.OVERTIME;

    return {
      ...options,
      activity: {
        ...options.activity,
        isOvertime: isOvertimePeriod,
        overtimeMissed: options.activity.overtimeMissed || false, // Ensure boolean
      },
    };
  }

  private shouldAutoComplete(
    options: ProcessingOptions,
    currentRecord: AttendanceRecord | null,
  ): boolean {
    const overtimeMissed = options.activity.overtimeMissed || false;

    if (!overtimeMissed) {
      return false;
    }

    if (
      options.periodType === PeriodType.REGULAR &&
      currentRecord?.type === PeriodType.OVERTIME &&
      !currentRecord.CheckOutTime &&
      options.activity.isCheckIn
    ) {
      return true;
    }

    if (!currentRecord?.CheckInTime && !options.activity.isCheckIn) {
      return true;
    }

    return false;
  }

  /**
   * Check-in/Check-out Processing
   */
  private async processCheckIn(
    tx: Prisma.TransactionClient,
    periodState: ShiftWindowResponse,
    options: ProcessingOptions,
    locationData: LocationDataInput | undefined,
    now: Date,
  ): Promise<AttendanceRecord> {
    // Get latest sequence number for this date
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
        shiftStartTime: parseISO(periodState.current.start),
        shiftEndTime: parseISO(periodState.current.end),
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
            isDayOff: periodState.isDayOff,
            source: options.metadata?.source || 'system',
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

    // Then create location if needed
    if (locationData) {
      await tx.attendanceLocation.create({
        data: {
          ...locationData,
          attendance: {
            connect: { id: attendance.id },
          },
        },
      });
    }

    return AttendanceMappers.toAttendanceRecord(attendance)!;
  }

  private async processCheckOut(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    options: ProcessingOptions,
    locationData: LocationDataInput | undefined,
    now: Date,
  ): Promise<AttendanceRecord> {
    // Add logging for overtime checkout
    console.log('Processing checkout:', {
      hasCurrentRecord: !!currentRecord,
      recordDetails: currentRecord
        ? {
            type: currentRecord.type,
            checkIn: format(currentRecord.CheckInTime!, 'HH:mm:ss'),
            isOvertime: currentRecord.type === PeriodType.OVERTIME,
          }
        : null,
      requestDetails: {
        periodType: options.periodType,
        isOvertime: options.activity.isOvertime,
        overtimeMissed: options.activity.overtimeMissed,
      },
    });

    // Find active record with improved query matching Status API
    const activeRecord = await tx.attendance.findFirst({
      where: {
        employeeId: options.employeeId,
        type: options.periodType,
        AND: [
          {
            OR: [
              // Regular records from today
              {
                date: {
                  gte: startOfDay(subDays(now, 1)),
                  lt: endOfDay(now),
                },
                CheckInTime: { not: null },
                CheckOutTime: null,
              },
              // Overnight records spanning midnight
              {
                type: PeriodType.OVERTIME,
                CheckInTime: {
                  not: null,
                  lt: endOfDay(now),
                },
                CheckOutTime: null,
                // Must be active (not checked out)
                OR: [
                  { CheckOutTime: null },
                  {
                    CheckOutTime: {
                      gt: startOfDay(now),
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      orderBy: [{ date: 'desc' }, { CheckInTime: 'desc' }],
      include: {
        timeEntries: true,
        overtimeEntries: true,
        location: true,
        metadata: true,
        checkTiming: true,
      },
    });

    console.log('Active record search result:', {
      found: !!activeRecord,
      details: activeRecord
        ? {
            id: activeRecord.id,
            type: activeRecord.type,
            date: format(activeRecord.date, 'yyyy-MM-dd'),
            checkIn: format(activeRecord.CheckInTime!, 'HH:mm:ss'),
            isOvertime: activeRecord.type === PeriodType.OVERTIME,
          }
        : null,
      searchParams: {
        periodType: options.periodType,
        dateRange: {
          start: format(startOfDay(subDays(now, 1)), 'yyyy-MM-dd HH:mm'),
          end: format(endOfDay(now), 'yyyy-MM-dd HH:mm'),
        },
      },
    });

    if (!activeRecord) {
      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: `No active ${options.periodType} period found for checkout.`,
        details: {
          searchCriteria: {
            employeeId: options.employeeId,
            periodType: options.periodType,
            dates: {
              start: format(startOfDay(subDays(now, 1)), 'yyyy-MM-dd HH:mm'),
              end: format(endOfDay(now), 'yyyy-MM-dd HH:mm'),
            },
          },
        },
      });
    }

    // Important: Validate checkout time is after check-in
    const checkInTime = new Date(activeRecord.CheckInTime!);
    const requestedCheckoutTime = new Date(options.checkTime);

    if (requestedCheckoutTime < checkInTime) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Check-out time cannot be earlier than check-in time',
        details: {
          checkInTime: checkInTime.toISOString(),
          requestedCheckoutTime: requestedCheckoutTime.toISOString(),
        },
      });
    }

    // Handle location update
    if (locationData && activeRecord) {
      if (activeRecord.location) {
        await tx.attendanceLocation.update({
          where: { attendanceId: activeRecord.id },
          data: locationData,
        });
      } else {
        await tx.attendanceLocation.create({
          data: {
            ...locationData,
            attendance: {
              connect: { id: activeRecord.id },
            },
          },
        });
      }
    }

    // Calculate overtime duration if needed
    let overtimeDuration = 0;
    if (
      options.periodType === PeriodType.OVERTIME &&
      activeRecord.timeEntries?.[0]
    ) {
      const hours = activeRecord.timeEntries[0]
        .hours as unknown as TimeEntryHours;
      overtimeDuration = Number(hours?.overtime) || 0;
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
          overtimeDuration,
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

  /**
   * Record Completion
   */
  private async completeAttendanceRecord(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord,
    periodState: ShiftWindowResponse,
    options: ProcessingOptions,
    now: Date,
  ): Promise<AttendanceRecord> {
    const completionTime = parseISO(
      currentRecord.type === PeriodType.OVERTIME
        ? periodState.current.end
        : periodState.shift.endTime,
    );

    const updatedRecord = await tx.attendance.update({
      where: { id: currentRecord.id },
      data: {
        CheckOutTime: completionTime,
        state: AttendanceState.PRESENT,
        checkStatus: CheckStatus.CHECKED_OUT,
        overtimeState:
          currentRecord.type === PeriodType.OVERTIME
            ? OvertimeState.COMPLETED
            : undefined,
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

    // Update or create time entry
    if (currentRecord.timeEntries[0]) {
      await tx.timeEntry.update({
        where: { id: currentRecord.timeEntries[0].id },
        data: {
          endTime: completionTime,
          status: TimeEntryStatus.COMPLETED,
          hours: {
            regular:
              currentRecord.type === PeriodType.REGULAR
                ? this.calculateHours(
                    currentRecord.CheckInTime!,
                    completionTime,
                  )
                : 0,
            overtime:
              currentRecord.type === PeriodType.OVERTIME
                ? this.calculateHours(
                    currentRecord.CheckInTime!,
                    completionTime,
                  )
                : 0,
          },
          metadata: {
            source: 'auto',
            version: 1,
            updatedAt: now.toISOString(),
          },
        },
      });
    }

    return AttendanceMappers.toAttendanceRecord(updatedRecord)!;
  }

  /**
   * Data Preparation and Utilities
   */

  private prepareLocationJson(
    location?: GeoLocation,
  ): Prisma.InputJsonValue | undefined {
    if (!location) return undefined;

    return {
      lat: location.lat,
      lng: location.lng,
      longitude: location.longitude,
      latitude: location.latitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp?.toISOString(),
      provider: location.provider,
    };
  }

  private async getLatestAttendance(
    tx: Prisma.TransactionClient,
    employeeId: string,
    periodType?: PeriodType,
    timeContext?: {
      searchTime: Date;
      checkTime: Date;
    },
  ): Promise<AttendanceRecord | null> {
    const searchTime = timeContext?.searchTime || getCurrentTime();
    const checkTime = timeContext?.checkTime || searchTime;

    console.log('Attendance search context:', {
      searchTime: format(searchTime, 'yyyy-MM-dd HH:mm:ss'),
      checkTime: format(checkTime, 'yyyy-MM-dd HH:mm:ss'),
      periodType,
    });

    const record = await tx.attendance.findFirst({
      where: {
        employeeId,
        type: periodType,
        OR: [
          // Regular day records
          {
            date: {
              gte: startOfDay(checkTime),
              lt: endOfDay(checkTime),
            },
            CheckInTime: { not: null },
            CheckOutTime: null,
          },
          // Overnight records - check both days
          {
            type: PeriodType.OVERTIME,
            CheckInTime: {
              not: null,
            },
            CheckOutTime: null,
            date: {
              gte: startOfDay(subDays(searchTime, 1)),
              lte: endOfDay(searchTime),
            },
          },
        ],
      },
      orderBy: [{ date: 'desc' }, { CheckInTime: 'desc' }],
      include: {
        timeEntries: true,
        overtimeEntries: true,
        location: true,
        metadata: true,
      },
    });

    console.log('Record search result:', {
      found: !!record,
      details: record
        ? {
            id: record.id,
            type: record.type,
            date: format(record.date, 'yyyy-MM-dd'),
            checkIn: record.CheckInTime
              ? format(record.CheckInTime, 'HH:mm:ss')
              : null,
            dateContext: {
              clientDate: format(checkTime, 'yyyy-MM-dd'),
              serverDate: format(searchTime, 'yyyy-MM-dd'),
            },
          }
        : null,
    });

    return record ? AttendanceMappers.toAttendanceRecord(record) : null;
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
        `${options.periodType} ${options.activity.isCheckIn ? 'check-in' : 'check-out'}`,
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

  private calculateHours(start: Date, end: Date): number {
    return (
      Math.round(((end.getTime() - start.getTime()) / (1000 * 60 * 60)) * 100) /
      100
    );
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

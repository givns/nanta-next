// services/Attendance/AttendanceProcessingService.ts

import {
  PrismaClient,
  Prisma,
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
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
} from 'date-fns';

// Import services
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { TimeEntryService } from '../TimeEntryService';

// Import utils
import { AttendanceMappers } from './utils/AttendanceMappers';
import { AttendanceEnhancementService } from './AttendanceEnhancementService';
import { PeriodManagementService } from './PeriodManagementService';
import { StatusHelpers } from './utils/StatusHelper';

// services/Attendance/AttendanceProcessingService.ts
export class AttendanceProcessingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly shiftService: ShiftManagementService,
    private readonly periodManager: PeriodManagementService,
    private readonly timeEntryService: TimeEntryService,
    private readonly enhancementService: AttendanceEnhancementService,
  ) {}

  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    const now = getCurrentTime();

    return this.prisma.$transaction(async (tx) => {
      try {
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

        // Handle transition case
        if (options.activity.isTransition && options.activity.isOvertime) {
          return this.handleOvertimeTransition(
            tx,
            currentRecord,
            window,
            options,
            now,
          );
        }

        // 2. Handle auto-completion if needed
        if (options.activity.overtimeMissed) {
          return this.handleAutoCompletion(
            tx,
            currentRecord,
            window,
            options,
            now,
          );
        }

        // 3. Process regular attendance
        const previousState = currentRecord
          ? this.periodManager.resolveCurrentPeriod(currentRecord, window, now)
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
          options,
          currentRecord,
          now,
        );

        // Let TimeEntryService handle time entries with proper status update
        const timeEntries = await this.timeEntryService.processTimeEntries(
          tx,
          processedAttendance,
          timeEntryStatusUpdate,
          options,
        );

        // Rest of the method remains the same...
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
      } catch (error) {
        console.error('Attendance processing error:', error);
        throw this.handleProcessingError(error);
      }
    });
  }

  private async handleOvertimeTransition(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord | null,
    window: ShiftWindowResponse,
    options: ProcessingOptions,
    now: Date,
  ): Promise<ProcessingResult> {
    // 1. Process regular checkout
    const checkoutOptions = {
      ...options,
      activity: { ...options.activity, isCheckIn: false, isOvertime: false },
    };

    const checkoutRecord = await this.processAttendanceRecord(
      tx,
      currentRecord,
      window,
      checkoutOptions,
      now,
    );

    // 2. Process overtime check-in
    const overtimeOptions = {
      ...options,
      activity: { ...options.activity, isCheckIn: true, isOvertime: true },
    };

    const overtimeRecord = await this.processAttendanceRecord(
      tx,
      checkoutRecord,
      window,
      overtimeOptions,
      now,
    );

    // 3. Process time entries for both records
    const [checkoutTimeEntry, overtimeTimeEntry] = await Promise.all([
      this.timeEntryService.processTimeEntries(
        tx,
        checkoutRecord,
        this.createStatusUpdateFromProcessing(
          checkoutOptions,
          currentRecord,
          now,
        ),
        checkoutOptions,
      ),
      this.timeEntryService.processTimeEntries(
        tx,
        overtimeRecord,
        this.createStatusUpdateFromProcessing(
          overtimeOptions,
          checkoutRecord,
          now,
        ),
        overtimeOptions,
      ),
    ]);

    // 4. Get final state
    const currentState = this.periodManager.resolveCurrentPeriod(
      overtimeRecord,
      window,
      now,
    );

    const stateValidation = await this.enhancementService.createStateValidation(
      overtimeRecord,
      currentState,
      window,
      now,
    );

    // Combine time entries into a single array
    const combinedTimeEntries = {
      regular: checkoutTimeEntry.regular,
      overtime: [
        ...(checkoutTimeEntry.overtime || []),
        ...(overtimeTimeEntry.overtime || []),
      ],
    };

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
        source: 'system',
        timeEntries: combinedTimeEntries,
        isTransition: true,
      },
    };
  }

  private async handleAutoCompletion(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord | null,
    window: ShiftWindowResponse,
    options: ProcessingOptions,
    now: Date,
  ): Promise<ProcessingResult> {
    if (currentRecord) {
      const currentStatus = {
        state: currentRecord.state,
        checkStatus: currentRecord.checkStatus,
        isOvertime: currentRecord.isOvertime,
        overtimeState: currentRecord.overtimeState,
      };

      // Check if record can be completed
      if (StatusHelpers.isComplete(currentStatus)) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: 'Record already completed',
        });
      }
    }

    // 1. Complete the attendance record first
    const completedAttendance = await this.processAttendanceRecord(
      tx,
      currentRecord,
      window,
      {
        ...options,
        activity: {
          ...options.activity,
          isCheckIn: false,
        },
      },
      now,
    );

    // Create proper StatusUpdateResult for auto-completion
    const timeEntryStatusUpdate = this.createStatusUpdateFromProcessing(
      options,
      currentRecord,
      now,
    );

    // Pass both statusUpdate and options
    const timeEntries = await this.timeEntryService.processTimeEntries(
      tx,
      completedAttendance,
      timeEntryStatusUpdate,
      options,
    );

    // 3. Get current state
    const currentState = this.periodManager.resolveCurrentPeriod(
      completedAttendance,
      window,
      now,
    );

    // 4. Create validation
    const stateValidation = await this.enhancementService.createStateValidation(
      completedAttendance,
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
        },
        validation: stateValidation,
      },
      metadata: {
        source: 'auto',
        timeEntries,
      },
    };
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

    // Prepare attendance data using correct schema structure
    const attendanceData: Prisma.AttendanceCreateInput = {
      user: { connect: { employeeId: options.employeeId } },
      date: startOfDay(now),
      state: AttendanceState.INCOMPLETE,
      checkStatus: CheckStatus.CHECKED_IN,
      type: options.periodType,
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

    // Use schema-compliant update structure
    const attendance = await tx.attendance.upsert({
      where: {
        employee_date_attendance: {
          employeeId: options.employeeId,
          date: startOfDay(now),
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
  ): Promise<AttendanceRecord | null> {
    const record = await tx.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(getCurrentTime()),
          lt: endOfDay(getCurrentTime()),
        },
      },
      include: {
        timeEntries: true,
        overtimeEntries: true,
        location: true,
        metadata: true,
      },
      orderBy: {
        metadata: {
          createdAt: 'desc',
        },
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

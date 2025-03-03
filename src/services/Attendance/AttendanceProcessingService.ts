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
  GeoLocation,
  StatusUpdateResult,
  TimeEntryHours,
  ValidationContext,
  ATTENDANCE_CONSTANTS,
  PeriodState,
  ValidationResult,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import {
  startOfDay,
  endOfDay,
  parseISO,
  format,
  subDays,
  differenceInMinutes,
  subMinutes,
  addDays,
  addHours,
  set,
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

  private attendanceCache = new Map<
    string,
    { data: AttendanceRecord | null; timestamp: number }
  >();

  /**
   * Main entry point for processing attendance
   */

  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    const now = getCurrentTime();

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const validatedOptions = await this.validateAndNormalizeOptions(
            options,
            tx,
          );

          console.log('Processing attendance:', {
            type: validatedOptions.periodType,
            requestedTime: format(
              new Date(validatedOptions.checkTime),
              'yyyy-MM-dd HH:mm:ss',
            ),
            serverTime: format(now, 'yyyy-MM-dd HH:mm:ss'),
            activity: validatedOptions.activity,
            hasPreCalculatedStatus: !!options.preCalculatedStatus,
          });

          const currentRecord = await this.getLatestAttendance(
            tx,
            options.employeeId,
            options.periodType,
            new Date(validatedOptions.checkTime),
          );

          // Get effective shift - either from pre-calculated status or from service
          let shiftData;
          let periodState;

          if (options.preCalculatedStatus) {
            // Log detailed structure
            console.log('Examining preCalculatedStatus structure:', {
              hasDaily: !!options.preCalculatedStatus.daily,
              hasBase: !!options.preCalculatedStatus.base,
              hasContext: !!options.preCalculatedStatus.context,
              hasValidation: !!options.preCalculatedStatus.validation,
              dailyKeys: options.preCalculatedStatus.daily
                ? Object.keys(options.preCalculatedStatus.daily)
                : [],
              baseKeys: options.preCalculatedStatus.base
                ? Object.keys(options.preCalculatedStatus.base)
                : [],
            });
            // Extract shift data from pre-calculated status
            shiftData = {
              current: options.preCalculatedStatus.context.shift,
              isAdjusted:
                options.preCalculatedStatus.context.schedule.isAdjusted,
            };

            // Extract period state from pre-calculated status
            const currentState = options.preCalculatedStatus.daily.currentState;

            // Create a proper ValidationResult object to match PeriodState.validation
            const validationResult: ValidationResult = {
              isValid: options.preCalculatedStatus.validation.allowed,
              state: options.preCalculatedStatus.base.state,
              errors: options.preCalculatedStatus.validation.errors || [],
              warnings: options.preCalculatedStatus.validation.warnings || [],
              checkInAllowed:
                options.preCalculatedStatus.validation.flags?.isCheckingIn ||
                false,
              checkOutAllowed:
                options.preCalculatedStatus.validation.flags?.hasActivePeriod ||
                false,
              overtimeAllowed:
                options.preCalculatedStatus.validation.flags?.isOvertime ||
                false,
              metadata: {
                lastValidated: now,
                validatedBy: 'system',
                rules: ['TIME_WINDOW', 'ATTENDANCE_STATE', 'TRANSITION'],
              },
            };

            // Create a proper PeriodState object
            periodState = {
              current: {
                type: currentState.type,
                timeWindow: {
                  start: currentState.timeWindow.start,
                  end: currentState.timeWindow.end,
                },
                activity: currentState.activity,
                validation: currentState.validation,
              },
              transitions: options.preCalculatedStatus.daily.transitions || [],
              overtime:
                options.preCalculatedStatus.context.nextPeriod?.overtimeInfo,
              validation: validationResult,
            };

            console.log('Using period state from pre-calculated status:', {
              type: periodState.current.type,
              transitions: periodState.transitions.length,
              hasOvertime: !!periodState.overtime,
            });
          } else {
            // Get shift data and period state the original way
            shiftData = await this.shiftService.getEffectiveShift(
              options.employeeId,
              now,
            );

            if (!shiftData) {
              throw new AppError({
                code: ErrorCode.SHIFT_DATA_ERROR,
                message: 'Shift configuration not found',
              });
            }

            // Get period state from manager
            periodState = await this.periodManager.getCurrentPeriodState(
              options.employeeId,
              currentRecord ? [currentRecord] : [],
              now,
            );

            console.log('Calculated new period state:', {
              type: periodState.current.type,
              transitions: periodState.transitions.length,
              hasOvertime: !!periodState.overtime,
            });
          }

          // Transform to window response
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
          if (this.shouldAutoComplete(validatedOptions, currentRecord)) {
            return this.handleAutoCompletion(
              tx,
              currentRecord!,
              windowResponse,
              validatedOptions,
              now,
              periodState,
            );
          }

          // Create base location data
          const locationData = options.location
            ? this.createBaseLocationData(
                options.location,
                options.activity.isCheckIn,
              )
            : undefined;

          // Process attendance record
          const processedAttendance = await this.processAttendanceRecord(
            tx,
            currentRecord,
            windowResponse,
            validatedOptions,
            locationData,
            new Date(validatedOptions.checkTime),
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
            isOvertime: options.periodType === PeriodType.OVERTIME,
          };

          // Get enhanced status
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
            periodState as PeriodState,
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
          };
        },
        {
          timeout: 30000,
          maxWait: 10000,
        },
      );

      // Do the cache invalidation in the background
      await cacheService.set(`forceRefresh:${options.employeeId}`, 'true', 30);

      console.log(
        `✅ Attendance processing completed for ${options.employeeId}`,
      );

      return {
        ...result,
        metadata: {
          ...result.metadata,
          source: 'system',
        },
      };
    } catch (error) {
      console.error(
        `❌ Attendance processing error for ${options.employeeId}:`,
        error,
      );
      throw this.handleProcessingError(error);
    }
  }

  /**
   * Auto-completion handling
   */
  private async handleAutoCompletion(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord,
    windowResponse: ShiftWindowResponse,
    options: ProcessingOptions,
    now: Date,
    validation: PeriodState,
  ): Promise<ProcessingResult> {
    try {
      // Verify we have a record to complete
      if (!currentRecord?.type || !currentRecord.CheckInTime) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: 'Invalid record for auto-completion',
        });
      }

      // Use overtime ID from either options or window response
      const overtimeId =
        options.metadata?.overtimeId || windowResponse.overtimeInfo?.id;

      console.log('Auto-completion started for record:', {
        recordId: currentRecord.id,
        recordType: currentRecord.type,
        checkIn: format(currentRecord.CheckInTime, 'HH:mm:ss'),
        checkOut: currentRecord.CheckOutTime
          ? format(currentRecord.CheckOutTime, 'HH:mm:ss')
          : null,
        hasOvertime: !!windowResponse.overtimeInfo,
        overtimeId,
        toType:
          options.transition?.to?.type ||
          (windowResponse.overtimeInfo ? PeriodType.OVERTIME : null),
      });

      const completedRecord = await this.completeAttendanceRecord(
        tx,
        currentRecord,
        windowResponse,
        options,
        now,
      );

      // Handle transition to overtime based on various conditions
      const shouldCreateOvertime =
        // Explicit transition to overtime
        options.transition?.to?.type === PeriodType.OVERTIME ||
        // Window has overtime info that connects to the current period
        (windowResponse.overtimeInfo &&
          windowResponse.overtimeInfo.startTime ===
            windowResponse.shift.endTime) ||
        // Currently in regular period and next period is overtime
        (currentRecord.type === PeriodType.REGULAR &&
          windowResponse.type === PeriodType.REGULAR &&
          windowResponse.overtimeInfo);

      // NEW: Create overtime record if needed
      if (shouldCreateOvertime) {
        console.log('Creating overtime record after completion', {
          overtimeId,
          windowOvertimeInfo: !!windowResponse.overtimeInfo,
          startTime: windowResponse.overtimeInfo?.startTime,
          endTime: windowResponse.overtimeInfo?.endTime,
        });

        // Ensure we have overtime ID
        if (!overtimeId && windowResponse.overtimeInfo?.id) {
          console.log('Using overtime ID from window response');
        }

        const finalOvertimeId = overtimeId || windowResponse.overtimeInfo?.id;

        if (!finalOvertimeId) {
          console.warn('No overtime ID available for overtime record creation');
        }

        try {
          // Create new overtime check-in
          const overtimeRecord = await this.processCheckIn(
            tx,
            windowResponse,
            {
              ...options,
              periodType: PeriodType.OVERTIME,
              metadata: {
                ...options.metadata,
                overtimeId: finalOvertimeId,
                source: 'auto',
              },
              activity: {
                ...options.activity,
                isCheckIn: true,
                isOvertime: true,
              },
            },
            options.location
              ? this.createBaseLocationData(options.location, true)
              : undefined,
            now,
          );

          console.log('Created overtime record successfully', {
            overtimeRecordId: overtimeRecord.id,
            type: overtimeRecord.type,
            checkIn: format(overtimeRecord.CheckInTime!, 'HH:mm:ss'),
          });

          // Create time entry for overtime
          await this.timeEntryService.processTimeEntries(
            tx,
            overtimeRecord,
            this.createStatusUpdateFromProcessing(
              {
                ...options,
                periodType: PeriodType.OVERTIME,
                activity: {
                  ...options.activity,
                  isCheckIn: true,
                  isOvertime: true,
                },
                metadata: {
                  ...options.metadata,
                  overtimeId: finalOvertimeId,
                  source: 'auto',
                },
              },
              null,
              now,
            ),
            {
              ...options,
              periodType: PeriodType.OVERTIME,
              activity: {
                ...options.activity,
                isCheckIn: true,
                isOvertime: true,
              },
            },
            validation,
          );
        } catch (overtimeError) {
          console.error('Error creating overtime record:', overtimeError);
          // Continue execution even if overtime creation fails
          // This ensures we at least return the completed regular record
        }
      }

      // Create validation context for completed record
      const validationContext: ValidationContext = {
        employeeId: options.employeeId,
        timestamp: now,
        isCheckIn: false,
        state: completedRecord.state,
        checkStatus: completedRecord.checkStatus,
        overtimeState: completedRecord.overtimeState,
        attendance: completedRecord,
        shift: windowResponse.shift,
        periodType: completedRecord.type,
        isOvertime: completedRecord.type === PeriodType.OVERTIME,
      };

      // Get enhanced status
      const enhancedStatus =
        await this.enhancementService.enhanceAttendanceStatus(
          AttendanceMappers.toSerializedAttendanceRecord(completedRecord),
          windowResponse,
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
    windowResponse: ShiftWindowResponse,
    options: ProcessingOptions,
    locationData: LocationDataInput | undefined,
    now: Date,
  ): Promise<AttendanceRecord> {
    const isCheckIn = options.activity.isCheckIn;

    if (!isCheckIn) {
      return this.processCheckOut(
        tx,
        currentRecord,
        windowResponse,
        options,
        locationData,
        now,
      );
    }

    return this.processCheckIn(tx, windowResponse, options, locationData, now);
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

  // services/Attendance/AttendanceProcessingService.ts
  private async validateAndNormalizeOptions(
    options: ProcessingOptions,
    tx: Prisma.TransactionClient,
  ): Promise<ProcessingOptions> {
    const isOvertimePeriod = options.periodType === PeriodType.OVERTIME;

    // Get current record first
    const currentRecord = await this.getLatestAttendance(
      tx,
      options.employeeId,
      options.periodType,
      new Date(options.checkTime),
    );

    console.log('Validating options:', {
      type: options.periodType,
      isCheckIn: options.activity.isCheckIn,
      currentRecord: currentRecord
        ? {
            type: currentRecord.type,
            checkIn: currentRecord.CheckInTime,
            checkOut: currentRecord.CheckOutTime,
          }
        : null,
      overtimeMissed: options.activity.overtimeMissed,
      hasPreCalculatedStatus: !!options.preCalculatedStatus,
    });

    // Check if auto-completion needed - leverage pre-calculated status if available
    const shouldAutoComplete = options.preCalculatedStatus
      ? Boolean(options.activity.overtimeMissed) // Trust the flag if status was pre-calculated
      : this.shouldAutoComplete(options, currentRecord);

    console.log('Auto-completion check:', {
      shouldAutoComplete,
      overtimeMissed: options.activity.overtimeMissed,
      autoCompletionNeeded: this.shouldAutoComplete(options, currentRecord),
    });

    return {
      ...options,
      activity: {
        ...options.activity,
        isOvertime: isOvertimePeriod,
        overtimeMissed: shouldAutoComplete,
      },
    };
  }

  /**
   * Checks if auto-completion is needed for the current operation
   */
  private shouldAutoComplete(
    options: ProcessingOptions,
    currentRecord: AttendanceRecord | null,
    windowResponse?: ShiftWindowResponse,
  ): boolean {
    console.log('Auto-completion check details:', {
      recordType: currentRecord?.type,
      isCheckIn: options.activity.isCheckIn,
      transition: options.transition,
      hasOvertimeId: !!options.metadata?.overtimeId,
      hasWindowOvertime: !!windowResponse?.overtimeInfo,
      windowOvertimeId: windowResponse?.overtimeInfo?.id,
    });

    // Case 1: Regular -> Overtime transition
    if (
      (options.transition?.to?.type === PeriodType.OVERTIME ||
        (windowResponse?.overtimeInfo &&
          windowResponse.type === PeriodType.REGULAR)) &&
      (options.metadata?.overtimeId || windowResponse?.overtimeInfo?.id) &&
      currentRecord?.type === PeriodType.REGULAR &&
      currentRecord.CheckInTime &&
      !currentRecord.CheckOutTime
    ) {
      console.log('Auto-completion triggered: Regular -> Overtime transition');
      return true;
    }

    // Case 2: Overtime -> Regular transition
    if (
      options.periodType === PeriodType.REGULAR &&
      currentRecord?.type === PeriodType.OVERTIME &&
      !currentRecord.CheckOutTime &&
      options.activity.isCheckIn
    ) {
      console.log('Auto-completion triggered: Overtime -> Regular transition');
      return true;
    }

    // Case 3: Missing check-in
    if (!currentRecord?.CheckInTime && !options.activity.isCheckIn) {
      console.log('Auto-completion triggered: Missing check-in');
      return true;
    }

    // Case 4: New - End of regular period with pending overtime period
    if (
      options.periodType === PeriodType.REGULAR &&
      !options.activity.isCheckIn &&
      currentRecord?.type === PeriodType.REGULAR &&
      windowResponse?.overtimeInfo &&
      windowResponse.overtimeInfo.startTime === windowResponse.shift.endTime
    ) {
      const now = getCurrentTime();
      const shiftEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${windowResponse.shift.endTime}`,
      );

      // Check if we're near the end of shift
      if (Math.abs(differenceInMinutes(now, shiftEnd)) <= 30) {
        console.log(
          'Auto-completion triggered: End of regular period with pending overtime',
        );
        return true;
      }
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
    console.log('Starting processCheckIn with data:', {
      employeeId: options.employeeId,
      nowTime: format(now, 'yyyy-MM-dd HH:mm:ss'),
      periodType: options.periodType,
    });

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

    // Calculate timing details
    const today = format(now, 'yyyy-MM-dd');

    // Safely parse the shift times
    let shiftStart: Date;
    let shiftEnd: Date;

    try {
      // IMPORTANT: Always use the actual shift times, not the window/period times
      const shiftStartTime = periodState.shift.startTime;
      const shiftEndTime = periodState.shift.endTime;

      if (!shiftStartTime || !shiftEndTime) {
        throw new Error('Missing shift times');
      }

      // Safely parse with proper format
      shiftStart = parseISO(`${today}T${shiftStartTime}:00`);
      shiftEnd = parseISO(`${today}T${shiftEndTime}:00`);

      // Handle overnight shifts
      if (shiftEndTime < shiftStartTime) {
        shiftEnd = addDays(shiftEnd, 1);
      }

      // Validate parsed dates
      if (isNaN(shiftStart.getTime()) || isNaN(shiftEnd.getTime())) {
        throw new Error('Invalid shift times after parsing');
      }

      console.log('Successfully parsed shift times:', {
        start: format(shiftStart, 'yyyy-MM-dd HH:mm:ss'),
        end: format(shiftEnd, 'yyyy-MM-dd HH:mm:ss'),
      });
    } catch (error) {
      console.error('Error parsing shift times:', error);

      // FIXED: Use more sensible fallbacks based on the hour specified in the string
      const fallbackStartHour = parseInt(
        periodState.shift.startTime.split(':')[0],
        10,
      );
      const fallbackEndHour = parseInt(
        periodState.shift.endTime.split(':')[0],
        10,
      );

      // Use default of 8 AM if parsing fails completely
      shiftStart = set(startOfDay(now), {
        hours: isNaN(fallbackStartHour) ? 8 : fallbackStartHour,
        minutes: 0,
      });

      // Use default of 5 PM if parsing fails completely
      shiftEnd = set(startOfDay(now), {
        hours: isNaN(fallbackEndHour) ? 17 : fallbackEndHour,
        minutes: 0,
      });

      // Handle overnight
      if (fallbackEndHour < fallbackStartHour) {
        shiftEnd = addDays(shiftEnd, 1);
      }

      console.log('Using fallback shift times:', {
        start: format(shiftStart, 'yyyy-MM-dd HH:mm:ss'),
        end: format(shiftEnd, 'yyyy-MM-dd HH:mm:ss'),
      });
    }

    const earlyWindow = subMinutes(
      shiftStart,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
    );

    // Determine early/late status
    const isEarlyCheckIn = now < shiftStart && now >= earlyWindow;

    // Safe calculation of minutes late
    let minutesLate = 0;
    if (now > shiftStart) {
      try {
        minutesLate = differenceInMinutes(now, shiftStart);
      } catch (error) {
        console.error('Error calculating minutes late:', error);
      }
    }

    const lateStatus = {
      isLate: minutesLate > 5,
      minutesLate: minutesLate > 5 ? minutesLate : 0,
    };

    console.log('Check-in timing calculation:', {
      checkInTime: format(now, 'HH:mm:ss'),
      shiftStart: format(shiftStart, 'HH:mm:ss'),
      earlyWindow: format(earlyWindow, 'HH:mm:ss'),
      isEarlyCheckIn,
      minutesLate,
    });

    const nextSequence = latestRecord ? latestRecord.periodSequence + 1 : 1;

    // Create attendance record
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
        shiftStartTime: shiftStart,
        shiftEndTime: shiftEnd,
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
            isEarlyCheckIn,
            isLateCheckIn: lateStatus.isLate,
            lateCheckInMinutes: lateStatus.minutesLate,
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

    console.log('Created attendance record:', {
      id: attendance.id,
      employeeId: attendance.employeeId,
      checkInTime: attendance.CheckInTime
        ? format(attendance.CheckInTime, 'HH:mm:ss')
        : null,
      state: attendance.state,
      checkStatus: attendance.checkStatus,
    });

    return AttendanceMappers.toAttendanceRecord(attendance)!;
  }

  private async processCheckOut(
    tx: Prisma.TransactionClient,
    currentRecord: AttendanceRecord | null,
    windowResponse: ShiftWindowResponse,
    options: ProcessingOptions,
    locationData: LocationDataInput | undefined,
    now: Date,
  ): Promise<AttendanceRecord> {
    if (!currentRecord) {
      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: `No active ${options.periodType} period found for checkout.`,
        details: {
          employeeId: options.employeeId,
          requestedCheckout: format(now, 'HH:mm:ss'),
        },
      });
    }

    // Add logging for overtime checkout
    console.log('Processing checkout:', {
      hasCurrentRecord: !!currentRecord,
      recordDetails: currentRecord
        ? {
            type: currentRecord.type,
            checkIn: format(currentRecord.CheckInTime!, 'HH:mm:ss'),
            locationExists: Boolean(currentRecord.location),
            overtimeId: currentRecord.overtimeId,
            isOvertime: currentRecord.type === PeriodType.OVERTIME,
          }
        : null,
      requestDetails: {
        periodType: options.periodType,
        isOvertime: options.activity.isOvertime,
        overtimeMissed: options.activity.overtimeMissed,
      },
    });

    // Validate for overtime checkout
    if (
      options.periodType === PeriodType.OVERTIME &&
      options.activity.isOvertime &&
      !currentRecord.overtimeId
    ) {
      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: 'Invalid overtime record for checkout.',
        details: {
          recordId: currentRecord.id,
          type: currentRecord.type,
          overtimeId: currentRecord.overtimeId,
        },
      });
    }

    const checkInTime = new Date(currentRecord.CheckInTime!);
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

    // For overtime checkout, verify overtime info matches
    if (
      options.periodType === PeriodType.OVERTIME &&
      currentRecord.overtimeId
    ) {
      if (
        !windowResponse.overtimeInfo ||
        windowResponse.overtimeInfo.id !== currentRecord.overtimeId
      ) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: 'Overtime info mismatch',
          details: {
            recordOvertimeId: currentRecord.overtimeId,
            responseOvertimeId: windowResponse.overtimeInfo?.id,
          },
        });
      }
    }

    // Handle location update - First check if location record exists
    if (locationData) {
      const existingLocation = await tx.attendanceLocation.findUnique({
        where: { attendanceId: currentRecord.id },
      });

      if (existingLocation) {
        // Update existing location with check-out data only
        await tx.attendanceLocation.update({
          where: { attendanceId: currentRecord.id },
          data: {
            checkOutCoordinates: locationData.checkOutCoordinates,
            checkOutAddress: locationData.checkOutAddress,
          },
        });
      } else {
        // Create new location record
        await tx.attendanceLocation.create({
          data: {
            attendance: {
              connect: { id: currentRecord.id },
            },
            checkOutCoordinates: locationData.checkOutCoordinates,
            checkOutAddress: locationData.checkOutAddress,
          },
        });
      }
    }

    // Get checkout time based on period type
    const checkOutTime =
      options.periodType === PeriodType.OVERTIME &&
      windowResponse.overtimeInfo?.endTime
        ? parseISO(
            `${format(now, 'yyyy-MM-dd')}T${windowResponse.overtimeInfo.endTime}`,
          )
        : now;

    // Calculate overtime duration if needed
    let overtimeDuration = 0;
    if (
      options.periodType === PeriodType.OVERTIME &&
      currentRecord.timeEntries?.[0]
    ) {
      const hours = currentRecord.timeEntries[0]
        .hours as unknown as TimeEntryHours;
      overtimeDuration = Number(hours?.overtime) || 0;
    }

    // Update attendance record
    const updatedAttendance = await tx.attendance.update({
      where: { id: currentRecord.id },
      data: {
        CheckOutTime: checkOutTime,
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

    // Update time entry for overtime
    if (
      options.periodType === PeriodType.OVERTIME &&
      currentRecord.timeEntries[0]
    ) {
      await tx.timeEntry.update({
        where: { id: currentRecord.timeEntries[0].id },
        data: {
          endTime: checkOutTime,
          status: TimeEntryStatus.COMPLETED,
          hours: {
            regular: 0,
            overtime: this.calculateHours(
              currentRecord.CheckInTime!,
              checkOutTime,
            ),
          },
        },
      });
    }

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
    // Calculate completion time based on current time
    const completionTime = (() => {
      // For overtime transition, use the transition end time
      if (
        options.transition?.to?.type === PeriodType.OVERTIME &&
        options.transition.from?.endTime
      ) {
        return parseISO(
          `${format(now, 'yyyy-MM-dd')}T${options.transition.from.endTime}`,
        );
      }

      // For regular completion during overtime
      if (currentRecord.type === PeriodType.OVERTIME) {
        return parseISO(
          `${format(now, 'yyyy-MM-dd')}T${periodState.overtimeInfo?.endTime || format(now, 'HH:mm:ss')}`,
        );
      }

      // For regular periods
      return parseISO(
        `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
      );
    })();

    console.log('Completing attendance record:', {
      recordId: currentRecord.id,
      recordType: currentRecord.type,
      calculatedCompletionTime: format(completionTime, 'HH:mm:ss'),
      currentTime: format(now, 'HH:mm:ss'),
      hasTransition: Boolean(options.transition),
      transitionType: options.transition?.to?.type,
    });

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

      accuracy: location.accuracy,
      timestamp: location.timestamp?.toISOString(),
      provider: location.provider,
    };
  }

  private async getLatestAttendance(
    tx: Prisma.TransactionClient,
    employeeId: string,
    periodType?: PeriodType,
    effectiveTime: Date = getCurrentTime(),
  ): Promise<AttendanceRecord | null> {
    console.log(
      `Finding latest attendance for ${employeeId} [${periodType || 'all'}]`,
    );

    // Add more aggressive memory caching with a shorter TTL
    const cacheKey = `attendance:${employeeId}:${periodType || 'all'}`;
    const cached = this.attendanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5000) {
      // Reduce from 10s to 5s
      console.log(`Using cached attendance data for ${employeeId}`);
      return cached.data;
    }

    // Add query timeout
    const queryTimeout = setTimeout(() => {
      console.warn(
        `⚠️ Attendance query taking longer than expected for ${employeeId}`,
      );
    }, 1000);

    try {
      // Optimize query to be more selective
      const records = await tx.attendance.findMany({
        where: {
          employeeId,
          OR: [
            // Records for today only with specific period type
            {
              date: {
                gte: startOfDay(effectiveTime),
                lt: endOfDay(effectiveTime),
              },
              ...(periodType && { type: periodType }),
            },
            // Active (unchecked out) records only
            {
              CheckInTime: { not: null },
              CheckOutTime: null,
              ...(periodType && { type: periodType }),
            },
          ],
        },
        // Take only what's needed
        take: 5,
        include: {
          /* same includes */
        },
        orderBy: [{ CheckInTime: 'desc' }, { id: 'desc' }],
      });

      console.log('Query result:', {
        recordsFound: records.length,
        details: records.map((r) => ({
          id: r.id,
          type: r.type,
          date: format(r.date, 'yyyy-MM-dd'),
          checkIn: r.CheckInTime ? format(r.CheckInTime, 'HH:mm:ss') : null,
          checkOut: r.CheckOutTime ? format(r.CheckOutTime, 'HH:mm:ss') : null,
          active: !r.CheckOutTime,
        })),
      });

      // Find active record after query
      const activeRecord = records.find((r) => !r.CheckOutTime);
      const result = activeRecord
        ? AttendanceMappers.toAttendanceRecord(activeRecord)
        : null;

      // Update cache
      this.attendanceCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } finally {
      clearTimeout(queryTimeout);
    }
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
              latitude: options.location.coordinates.lat,
              longitude: options.location.coordinates.lng,
              accuracy: options.location.coordinates.accuracy,
            }
          : undefined,
        updatedBy: options.metadata?.updatedBy || 'system',
      },
    };
  }

  private calculateHours(start: Date, end: Date): number {
    const diffInMinutes = differenceInMinutes(end, start);
    return Math.round((diffInMinutes / 60) * 100) / 100; // Round to 2 decimal places
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

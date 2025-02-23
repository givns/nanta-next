// services/Attendance/PeriodStateResolver.ts
//PeriodStateResolver (Core)
//Primary responsibility: Calculate and validate period states
//Should own:
//State calculation
//Timing validations
//Window validations
// services/Attendance/PeriodStateResolver.ts
import {
  UnifiedPeriodState,
  ValidationContext,
  TimeWindow,
  StateValidation,
  ValidationResult,
  AttendanceRecord,
  PeriodStatusInfo,
  ShiftWindowResponse,
  ValidationError,
  ValidationWarning,
  ShiftData,
  VALIDATION_THRESHOLDS,
  OvertimeContext,
  ValidationFlags,
  TransitionStatusInfo,
  EnhancedTimeWindow,
  VALIDATION_ACTIONS,
  ValidationMetadata,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { TimeWindowManager } from '@/utils/timeWindow/TimeWindowManager';
import { AttendanceState, PeriodType } from '@prisma/client';
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  format,
  isWithinInterval,
  parseISO,
  subMinutes,
} from 'date-fns';

export class PeriodStateResolver {
  private cache: Map<
    string,
    {
      state: UnifiedPeriodState;
      timestamp: number;
    }
  > = new Map();

  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(private readonly timeManager: TimeWindowManager) {}

  /**
   * Main entry point for calculating period state with caching
   */
  public async calculatePeriodState(
    employeeId: string,
    records: AttendanceRecord[] | null,
    now: Date,
    shiftData: ShiftData,
    context: ValidationContext,
  ): Promise<UnifiedPeriodState> {
    const cacheKey = this.createCacheKey(employeeId, context);
    const cached = this.cache.get(cacheKey);

    // Check cache validity
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      if (this.isCachedStateValid(cached.state, context)) {
        return cached.state;
      }
    }

    // Calculate new state
    const newState = await this.resolveCurrentState(
      employeeId,
      records,
      now,
      shiftData,
      context,
    );

    console.log('Calculated new state:', newState);

    // Cache the new state
    this.cache.set(cacheKey, {
      state: newState,
      timestamp: Date.now(),
    });

    return newState;
  }

  /**
   * Builds validation flags for a period state
   */
  public buildValidationFlags(
    statusInfo: PeriodStatusInfo,
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
    shiftData: ShiftData,
    context: ValidationContext,
  ): ValidationFlags {
    // Calculate timing flags using TimeWindowManager
    const timingFlags = this.timeManager.calculateTimingFlags(
      attendance,
      currentState,
      context.timestamp,
    );

    // Determine schedule information
    const schedule = context.shift
      ? {
          isHoliday: false,
          isDayOff: !context.shift.workDays.includes(getCurrentTime().getDay()),
        }
      : {
          isHoliday: false,
          isDayOff: false,
        };

    console.log('Building validation flags:', {
      currentTime: format(context.timestamp, 'HH:mm:ss'),
      windowStart: currentState.timeWindow.start.substring(11, 19),
      windowEnd: currentState.timeWindow.end.substring(11, 19),
      isWithinBounds: currentState.validation.isWithinBounds,
      isEarlyCheckIn: timingFlags.isEarlyCheckIn,
      isEarlyCheckOut: timingFlags.isEarlyCheckOut,
      timingFlags,
    });

    // Calculate bounds and transitions
    const isInsideShift = Boolean(
      currentState.validation.isWithinBounds &&
        !currentState.validation.isLate &&
        !currentState.validation.isEarly,
    );

    const hasConnectingPeriod = Boolean(currentState.validation.isConnected);

    // Emergency Leave Logic
    const isEmergencyLeave = Boolean(
      statusInfo.isActiveAttendance && // User is checked in
        !statusInfo.shiftTiming.isAfterMidshift && // Not after midshift
        timingFlags.isEarlyCheckOut, // Attempting early checkout
    );

    // Build comprehensive flag set
    return {
      // Basic check-in/out status
      isCheckingIn: !statusInfo.isActiveAttendance,
      isLateCheckIn: timingFlags.isLateCheckIn,
      isEarlyCheckIn: timingFlags.isEarlyCheckIn,
      isEarlyCheckOut: timingFlags.isEarlyCheckOut,
      isLateCheckOut: timingFlags.isLateCheckOut,
      isVeryLateCheckOut: timingFlags.isVeryLateCheckOut,

      // Period status
      hasActivePeriod: statusInfo.isActiveAttendance,
      isInsideShift,
      isOutsideShift: !isInsideShift,
      isOvertime: currentState.activity.isOvertime,
      isDayOffOvertime: currentState.activity.isDayOffOvertime,
      isPendingOvertime: Boolean(
        !statusInfo.isActiveAttendance &&
          currentState.type === PeriodType.OVERTIME,
      ),

      // Automation flags
      isAutoCheckIn: Boolean(context.attendance?.metadata.source === 'auto'),
      isAutoCheckOut: Boolean(
        timingFlags.isVeryLateCheckOut && timingFlags.requiresAutoCompletion,
      ),
      requireConfirmation: Boolean(
        (timingFlags.isLateCheckIn || timingFlags.isEarlyCheckOut) &&
          !context.attendance?.metadata.isManualEntry,
      ),
      requiresAutoCompletion: timingFlags.requiresAutoCompletion,

      // Transition flags
      hasPendingTransition: hasConnectingPeriod,
      requiresTransition: timingFlags.requiresTransition,

      // Shift timing
      isMorningShift: statusInfo.shiftTiming.isMorningShift,
      isAfternoonShift: statusInfo.shiftTiming.isAfternoonShift,
      isAfterMidshift: statusInfo.shiftTiming.isAfterMidshift,

      // Special cases
      isPlannedHalfDayLeave: Boolean(
        statusInfo.isActiveAttendance &&
          timingFlags.isEarlyCheckOut &&
          !statusInfo.shiftTiming.isAfterMidshift,
      ),
      isEmergencyLeave,
      isApprovedEarlyCheckout: Boolean(
        timingFlags.isEarlyCheckOut &&
          (isEmergencyLeave || context.attendance?.metadata.isManualEntry),
      ),

      // Schedule status
      isHoliday: schedule.isHoliday,
      isDayOff: schedule.isDayOff,

      // Metadata
      isManualEntry: Boolean(attendance?.metadata.isManualEntry),
    };
  }

  /**
   * Creates validation metadata for the state
   */
  public buildValidationMetadata(
    transitionInfo: TransitionStatusInfo,
    flags: ValidationFlags,
  ): ValidationMetadata {
    if (!transitionInfo.isInTransition) {
      return {};
    }

    return {
      nextTransitionTime: format(
        transitionInfo.window.end,
        "yyyy-MM-dd'T'HH:mm:ss",
      ),
      requiredAction: flags.requiresTransition
        ? VALIDATION_ACTIONS.TRANSITION_REQUIRED
        : flags.requiresAutoCompletion
          ? VALIDATION_ACTIONS.AUTO_COMPLETE
          : undefined,
      transitionWindow: {
        start: format(transitionInfo.window.start, "yyyy-MM-dd'T'HH:mm:ss"),
        end: format(transitionInfo.window.end, "yyyy-MM-dd'T'HH:mm:ss"),
        targetPeriod: transitionInfo.targetPeriod,
      },
    };
  }

  /**
   * Determines if check-out is allowed
   */
  public canCheckOut(
    currentState: UnifiedPeriodState,
    statusInfo: PeriodStatusInfo,
    now: Date,
  ): boolean {
    // If no active attendance, can't check out
    if (!statusInfo.isActiveAttendance) {
      return false;
    }

    // Always allow check-out during overtime
    if (currentState.type === PeriodType.OVERTIME) {
      return true;
    }

    // Check if within regular check-out window
    const periodEnd = parseISO(currentState.timeWindow.end);
    const isWithinCheckoutWindow = isWithinInterval(now, {
      start: subMinutes(periodEnd, VALIDATION_THRESHOLDS.EARLY_CHECKOUT),
      end: addMinutes(periodEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
    });

    // Check for other conditions that allow check-out
    const specialConditions =
      statusInfo.timingFlags.isLateCheckOut ||
      statusInfo.timingFlags.isVeryLateCheckOut ||
      currentState.validation.isConnected ||
      statusInfo.timingFlags.isEarlyCheckOut;

    return isWithinCheckoutWindow || specialConditions;
  }

  /**
   * Gets appropriate validation message based on state
   */
  public getValidationMessage(
    statusInfo: PeriodStatusInfo,
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
    now: Date,
    flags: ValidationFlags,
  ): string {
    console.log('Getting validation message with flags:', flags);

    if (flags.isDayOff) {
      return 'วันหยุด';
    }
    // Overnight periods
    if (currentState.validation.isOvernight) {
      return 'อยู่ในช่วงเวลาทำงานข้ามวัน';
    }

    // Auto-completion required
    if (flags.requiresAutoCompletion) {
      return 'ระบบจะทำการลงเวลาออกให้อัตโนมัติ';
    }

    // Emergency leave
    if (flags.isEmergencyLeave) {
      return 'ขออนุญาตลาฉุกเฉิน';
    }

    // Active attendance cases
    if (statusInfo.isActiveAttendance) {
      if (flags.isVeryLateCheckOut) {
        return 'เลยเวลาออกงานมากกว่าที่กำหนด';
      }
      if (flags.isLateCheckOut) {
        return 'เลยเวลาออกงาน';
      }
      if (flags.requiresTransition) {
        return 'กรุณาลงเวลาออกก่อนเริ่มช่วงเวลาถัดไป';
      }
      return '';
    }

    // New check-in cases
    const periodStart = parseISO(currentState.timeWindow.start);

    if (flags.isOutsideShift) {
      const earlyWindow = {
        start: subMinutes(periodStart, VALIDATION_THRESHOLDS.EARLY_CHECKIN),
        end: periodStart,
      };
      console.log('earlyCheckInThreshold', earlyWindow);

      const minutesUntilShift = differenceInMinutes(earlyWindow.start, now);
      console.log('minutesUntilShift', minutesUntilShift);

      return minutesUntilShift > 60
        ? ''
        : `กรุณารอ ${minutesUntilShift} นาทีเพื่อเข้างาน`;
    }

    if (flags.isEarlyCheckIn) {
      return `อยู่ในช่วงลงเวลาก่อนเข้างาน 
      เวลาทำงาน${currentState.type === PeriodType.OVERTIME ? 'ล่วงเวลา' : 'ปกติ'}เริ่ม ${format(periodStart, 'HH:mm')} น.`;
    }

    if (flags.isLateCheckIn) {
      const minutesLate = differenceInMinutes(now, periodStart);
      return minutesLate <= VALIDATION_THRESHOLDS.LATE_CHECKIN
        ? `เลยเวลาเข้างาน ${minutesLate} นาที`
        : 'เลยเวลาเข้างาน';
    }

    // Default message for overtime
    if (currentState.type === PeriodType.OVERTIME) {
      return 'ช่วงเวลาทำงานล่วงเวลา';
    }

    // If we're inside shift, say so
    if (flags.isInsideShift) {
      return 'อยู่ในช่วงเวลาทำงาน'; // Within work hours
    }

    // Default - outside period
    return 'อยู่นอกช่วงเวลาทำงานที่กำหนด';
  }

  /**
   * Determines if a state is allowed for check-in/check-out
   */
  public determineAllowedStatus(
    flags: ValidationFlags,
    statusInfo: PeriodStatusInfo,
    currentState: UnifiedPeriodState,
  ): boolean {
    const now = getCurrentTime();

    console.log('Determining allowed status with flags:', {
      isInsideShift: flags.isInsideShift,
      isEarlyCheckIn: flags.isEarlyCheckIn,
      isLateCheckIn: flags.isLateCheckIn,
      isCheckingIn: !statusInfo.isActiveAttendance,
      isLate: currentState.validation.isLate,
      timeWindow: {
        start: currentState.timeWindow.start.substring(11, 19),
        end: currentState.timeWindow.end.substring(11, 19),
      },
      currentTime: now,
    });

    // Handle special cases first
    if (flags.isEmergencyLeave) {
      return true;
    }

    // Block very late check-outs unless auto-completion is enabled
    if (flags.isVeryLateCheckOut && !flags.requiresAutoCompletion) {
      return false;
    }

    // For active attendance
    if (statusInfo.isActiveAttendance) {
      // Allow checkout if:
      // 1. Inside shift or
      // 2. Has pending transition or
      // 3. Is overtime period
      return (
        flags.isInsideShift ||
        flags.hasPendingTransition ||
        currentState.type === PeriodType.OVERTIME
      );
    }

    // For new check-ins
    const periodStart = parseISO(currentState.timeWindow.start);
    const periodEnd = parseISO(currentState.timeWindow.end);

    // Explicitly check for late check-in window
    const isInLateCheckInWindow =
      currentState.validation.isLate && // Already marked as late
      now >= periodStart && // After period start
      now <= periodEnd && // Before period end
      differenceInMinutes(now, periodStart) <=
        VALIDATION_THRESHOLDS.LATE_CHECKIN; // Within threshold

    if (isInLateCheckInWindow) {
      // IMPORTANT: Log that we're explicitly allowing late check-in
      console.log(
        `Explicitly allowing late check-in (${differenceInMinutes(now, periodStart)} minutes late)`,
      );
      return true;
    }

    // Original check-in conditions
    return (
      // Allow if within shift bounds
      flags.isInsideShift ||
      // Or if early check-in is allowed
      flags.isEarlyCheckIn ||
      // Or if overtime is starting
      (flags.isOvertime && !flags.isDayOff) ||
      // Or if approved day-off overtime
      (flags.isOvertime && flags.isDayOffOvertime)
    );
  }

  /**
   * Creates a comprehensive state validation
   */
  public createStateValidation(
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
    shiftData: ShiftData,
    context: ValidationContext,
    statusInfo: PeriodStatusInfo,
    transitionInfo: TransitionStatusInfo,
  ): StateValidation {
    // Get validation flags
    const flags = this.buildValidationFlags(
      statusInfo,
      currentState,
      attendance,
      shiftData,
      context,
    );

    console.log('Built validation flags:', flags);

    // Determine allowed status
    const allowed = this.determineAllowedStatus(
      flags,
      statusInfo,
      currentState,
    );

    // Get reason message
    const reason = this.getValidationMessage(
      statusInfo,
      currentState,
      attendance,
      context.timestamp,
      flags,
    );

    console.log('Validation reason:', reason);

    // Build metadata
    const metadata = this.buildValidationMetadata(transitionInfo, flags);

    return {
      errors: {},
      warnings: {},
      allowed,
      reason,
      flags,
      metadata,
    };
  }

  /**
   * Creates default state for times outside normal windows
   */
  public createDefaultState(
    now: Date,
    shiftData: ShiftData,
    context: ValidationContext,
  ): UnifiedPeriodState {
    const today = format(now, 'yyyy-MM-dd');
    return {
      type: PeriodType.REGULAR,
      timeWindow: {
        start: `${today}T${shiftData.startTime}`,
        end: `${today}T${shiftData.endTime}`,
      },
      activity: {
        isActive: false,
        checkIn: null,
        checkOut: null,
        isOvertime: false,
        isDayOffOvertime: false,
        isInsideShiftHours: this.timeManager.isWithinShiftWindow(
          now,
          shiftData,
        ),
      },
      validation: {
        isWithinBounds: this.timeManager.isWithinShiftWindow(now, shiftData, {
          includeEarlyWindow: true,
          includeLateWindow: true,
        }),
        isEarly: false,
        isLate: false,
        isOvernight: shiftData.endTime < shiftData.startTime,
        isConnected: false,
      },
    };
  }

  /**
   * Creates a state for a specific period
   */
  public createPeriodState(
    windows: EnhancedTimeWindow[],
    attendance: AttendanceRecord | null,
    context: ValidationContext,
    shiftData: ShiftData,
  ): UnifiedPeriodState {
    const currentWindow = windows[0];
    const now = context.timestamp;
    const isCheckingIn = !attendance?.CheckInTime;

    // Detect late check-in scenario
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${shiftData.startTime}`,
    );
    const minutesSinceStart = differenceInMinutes(now, shiftStart);
    const shouldUseGracePeriodWindow =
      isCheckingIn &&
      minutesSinceStart > 0 &&
      minutesSinceStart <= VALIDATION_THRESHOLDS.LATE_CHECKIN;

    // Create a modified window for late check-in if needed
    let effectiveWindow = { ...currentWindow };
    if (shouldUseGracePeriodWindow) {
      effectiveWindow = {
        ...effectiveWindow,
        start: shiftStart,
        end: addMinutes(shiftStart, VALIDATION_THRESHOLDS.LATE_CHECKIN),
        isLateCheckin: true,
        isEarlyCheckin: false, // Required property
      };

      console.log('Late check-in detected - Using expanded window:', {
        originalWindow: {
          start: format(currentWindow.start, 'HH:mm:ss'),
          end: format(currentWindow.end, 'HH:mm:ss'),
        },
        expandedWindow: {
          start: format(effectiveWindow.start, 'HH:mm:ss'),
          end: format(effectiveWindow.end, 'HH:mm:ss'),
        },
        minutesLate: minutesSinceStart,
      });
    }

    console.log('currentWindow in createPeriodState', currentWindow);
    console.log('effectiveWindow in createPeriodState', effectiveWindow);
    console.log('now', now);

    const isWithinBounds = this.timeManager.isWithinValidBounds(
      now,
      currentWindow,
    );

    console.log('isWithinBounds in createPeriodState', isWithinBounds);

    console.log('isEarlyCheckin:', currentWindow.isEarlyCheckin);

    return {
      type: currentWindow.type,
      timeWindow: {
        start: format(effectiveWindow.start, "yyyy-MM-dd'T'HH:mm:ss"),
        end: format(effectiveWindow.end, "yyyy-MM-dd'T'HH:mm:ss"),
      },
      activity: {
        isActive: Boolean(attendance?.CheckInTime && !attendance?.CheckOutTime),
        checkIn: attendance?.CheckInTime?.toISOString() || null,
        checkOut: attendance?.CheckOutTime?.toISOString() || null,
        isOvertime: currentWindow.type === PeriodType.OVERTIME,
        isDayOffOvertime: Boolean(context.overtimeInfo?.isDayOffOvertime),
        isInsideShiftHours: this.timeManager.isWithinShiftWindow(
          now,
          shiftData,
        ),
      },
      validation: {
        isWithinBounds,
        isEarly: currentWindow.isEarlyCheckin,
        isLate: currentWindow.isLateCheckin,
        isOvernight: this.timeManager.isOvernightShift(shiftData),
        isConnected: this.hasConnectingPeriod(windows, currentWindow),
      },
    };
  }

  /**
   * Helper Methods
   */

  /**
   * Creates a cache key for state caching
   */
  private createCacheKey(
    employeeId: string,
    context: ValidationContext,
  ): string {
    return `${employeeId}:${context.periodType}:${context.timestamp.getTime()}`;
  }

  /**
   * Checks if cached state is still valid
   */
  private isCachedStateValid(
    cachedState: UnifiedPeriodState,
    context: ValidationContext,
  ): boolean {
    // Check if the period type matches
    if (cachedState.type !== context.periodType) {
      return false;
    }

    // Check if the time windows are still valid
    const stateStart = parseISO(cachedState.timeWindow.start);
    const stateEnd = parseISO(cachedState.timeWindow.end);

    return isWithinInterval(context.timestamp, {
      start: stateStart,
      end: stateEnd,
    });
  }

  /**
   * Resolves current state based on windows and context
   */
  private async resolveCurrentState(
    employeeId: string,
    records: AttendanceRecord[] | null,
    now: Date,
    shiftData: ShiftData,
    context: ValidationContext,
  ): Promise<UnifiedPeriodState> {
    console.log(employeeId, records, now, shiftData, context);
    // Handle null records
    const activeRecord =
      records?.find((r) => r.CheckInTime && !r.CheckOutTime) ?? null;

    // Calculate time windows
    const windows = this.timeManager.calculateTimeWindows(
      context.periodType || PeriodType.REGULAR,
      shiftData,
      context,
    );

    // Find relevant window for current time
    const currentWindow = this.findRelevantWindow(windows, now, activeRecord);

    console.log('Found relevant window:', currentWindow);

    // If no relevant window found, return default state
    if (!currentWindow) {
      return this.createDefaultState(now, shiftData, context);
    }

    // Create and return period state
    return this.createPeriodState(
      [currentWindow], // Pass as array for connecting window detection
      activeRecord,
      context,
      shiftData,
    );
  }

  /**
   * Finds the most relevant window for the current time and attendance
   */
  private findRelevantWindow(
    windows: EnhancedTimeWindow[],
    now: Date,
    attendance: AttendanceRecord | null,
  ): EnhancedTimeWindow | null {
    // First check for active attendance
    if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
      // Check for transition window first
      const transitionWindow = windows.find(
        (window) =>
          window.isTransition &&
          this.timeManager.isWithinValidBounds(now, window),
      );
      if (transitionWindow) return transitionWindow;

      // Then check for active period window
      const activeWindow = windows.find(
        (window) =>
          window.type === attendance.type &&
          this.timeManager.isWithinValidBounds(now, window),
      );
      if (activeWindow) return activeWindow;
    }

    // For non-active attendance, check all windows
    return (
      windows.find((window) =>
        this.timeManager.isWithinValidBounds(now, window),
      ) || null
    );
  }

  /**
   * Checks if a time is early for a period
   */
  private isEarlyForPeriod(
    time: Date,
    window: TimeWindow | EnhancedTimeWindow,
  ): boolean {
    // If it's an early check-in window, just check if time is before window start
    if ((window as EnhancedTimeWindow).isEarlyCheckin) {
      return time < window.start;
    }

    // For regular windows, check if within early threshold
    const earlyThreshold =
      window.type === PeriodType.OVERTIME
        ? VALIDATION_THRESHOLDS.OT_EARLY_CHECKIN
        : VALIDATION_THRESHOLDS.EARLY_CHECKIN;

    return isWithinInterval(time, {
      start: subMinutes(window.start, earlyThreshold),
      end: window.start,
    });
  }

  /**
   * Checks if a time is late for a period
   */
  private isLateForPeriod(
    time: Date,
    window: TimeWindow | EnhancedTimeWindow,
  ): boolean {
    return time > window.end;
  }

  /**
   * Checks if a window has a connecting period
   */
  private hasConnectingPeriod(
    windows: TimeWindow[],
    currentWindow: TimeWindow | null,
  ): boolean {
    if (!currentWindow) return false;

    return windows.some(
      (window) =>
        window.type !== currentWindow.type &&
        window.start.getTime() === currentWindow.end.getTime(),
    );
  }

  /**
   * Checks if a period spans overnight
   */
  private isOvernightPeriod(window: TimeWindow | null): boolean {
    if (!window) return false;
    return window.end < window.start;
  }

  /**
   * Sets hours from one date to another
   */
  private setHoursFromDate(baseDate: Date, timeDate: Date): Date {
    const result = new Date(baseDate);
    result.setHours(
      timeDate.getHours(),
      timeDate.getMinutes(),
      timeDate.getSeconds(),
      timeDate.getMilliseconds(),
    );
    return result;
  }

  // Additional functions to add to PeriodStateResolver

  /**
   * Validates if a period state is valid
   */
  public validatePeriodState(
    context: ValidationContext,
    window: TimeWindow | null,
    allWindows: TimeWindow[],
    currentState: UnifiedPeriodState,
    activeRecord: AttendanceRecord | null,
    windowResponse: ShiftWindowResponse,
  ): ValidationResult {
    const now = context.timestamp;
    const periodStart = parseISO(currentState.timeWindow.start);
    const periodEnd = parseISO(currentState.timeWindow.end);

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Calculate status info needed for validation
    const statusInfo: PeriodStatusInfo = {
      isActiveAttendance: Boolean(
        activeRecord?.CheckInTime && !activeRecord?.CheckOutTime,
      ),
      isOvertimePeriod: currentState.type === PeriodType.OVERTIME,
      timingFlags: this.timeManager.calculateTimingFlags(
        activeRecord,
        currentState,
        now,
      ),
      shiftTiming: this.calculateShiftTiming(windowResponse.shift, now),
    };

    // Time window validation
    const windowValidation = this.timeManager.validateTimeWindow(
      now,
      { start: periodStart, end: periodEnd, type: currentState.type },
      {
        includeEarlyWindow: true,
        includeLateWindow: true,
        periodType: currentState.type,
      },
    );

    if (!windowValidation.isValid) {
      errors.push(this.createTimeWindowError(now, periodStart, periodEnd));
    }

    // Check-in validation
    if (
      !activeRecord?.CheckInTime &&
      this.timeManager.isLateCheckIn(activeRecord, currentState, now)
    ) {
      warnings.push(this.createLateCheckInWarning(now, periodStart));
    }

    // Active attendance validation
    if (activeRecord?.CheckInTime && !activeRecord?.CheckOutTime) {
      const activeValidation = this.validateActiveAttendance(
        activeRecord,
        currentState,
        statusInfo,
        windowResponse,
        context,
      );

      errors.push(...activeValidation.errors);
      warnings.push(...activeValidation.warnings);
    }

    // Overtime period validation
    if (
      currentState.type === PeriodType.OVERTIME &&
      windowResponse.overtimeInfo
    ) {
      const isInOvertimePeriod = this.isWithinOvertimePeriod(
        now,
        windowResponse.overtimeInfo,
        activeRecord,
      );
      if (!isInOvertimePeriod) {
        warnings.push({
          code: 'OUTSIDE_OVERTIME_PERIOD',
          message: 'Current time is outside overtime period',
          details: {
            currentTime: format(now, 'HH:mm:ss'),
          },
        });
      }
    }

    // Early overtime validation
    if (
      currentState.type === PeriodType.OVERTIME &&
      windowResponse.overtimeInfo &&
      this.isBeforeShift(
        windowResponse.overtimeInfo.startTime,
        windowResponse.shift.startTime,
      )
    ) {
      const overtimeValidation = this.validateEarlyOvertime(
        windowResponse.overtimeInfo,
        now,
      );

      if (overtimeValidation) {
        errors.push(...overtimeValidation.errors);
        warnings.push(...overtimeValidation.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      state: activeRecord?.state || AttendanceState.ABSENT,
      errors,
      warnings,
      checkInAllowed: this.canCheckIn(currentState, statusInfo, now),
      checkOutAllowed: this.canCheckOut(currentState, statusInfo, now),
      overtimeAllowed: this.canStartOvertime(currentState, windowResponse, now),
      allowedTimeWindows: this.getAllowedTimeWindows(
        currentState,
        windowResponse,
      ),
      metadata: {
        lastValidated: now,
        validatedBy: 'system',
        rules: this.getAppliedRules(currentState, activeRecord),
      },
    };
  }

  /**
   * Gets all allowed time windows for a period
   */
  public getAllowedTimeWindows(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
  ): { start: Date; end: Date; type: PeriodType }[] {
    const result: { start: Date; end: Date; type: PeriodType }[] = [];

    // Add regular shift window
    result.push({
      start: parseISO(currentState.timeWindow.start),
      end: parseISO(currentState.timeWindow.end),
      type: currentState.type,
    });

    // Add overtime window if exists
    if (window.overtimeInfo) {
      const today = format(getCurrentTime(), 'yyyy-MM-dd');
      const overtimeStart = parseISO(
        `${today}T${window.overtimeInfo.startTime}`,
      );
      let overtimeEnd = parseISO(`${today}T${window.overtimeInfo.endTime}`);

      // Handle overnight overtime
      if (window.overtimeInfo.endTime < window.overtimeInfo.startTime) {
        overtimeEnd = addDays(overtimeEnd, 1);
      }

      result.push({
        start: overtimeStart,
        end: overtimeEnd,
        type: PeriodType.OVERTIME,
      });
    }

    return result;
  }

  /**
   * Validates an active attendance record
   */
  private validateActiveAttendance(
    attendance: AttendanceRecord,
    currentState: UnifiedPeriodState,
    statusInfo: PeriodStatusInfo,
    window: ShiftWindowResponse,
    context: ValidationContext,
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const now = context.timestamp;

    // Check if period matches attendance type
    if (attendance.type !== currentState.type) {
      errors.push({
        code: 'PERIOD_TYPE_MISMATCH',
        message: 'Active attendance period type mismatch',
        severity: 'error',
        timestamp: now,
        context,
      });
    }

    // Validate check-out timing
    if (attendance.CheckInTime) {
      const periodEnd = parseISO(currentState.timeWindow.end);
      if (now > addMinutes(periodEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT)) {
        warnings.push({
          code: 'LATE_CHECK_OUT',
          message: 'Late check-out detected',
          details: {
            minutesLate: differenceInMinutes(now, periodEnd),
          },
        });
      }
    }

    return {
      errors: [...errors],
      warnings: [...warnings],
    };
  }

  /**
   * Validates if a time is within a window with options
   */
  private isWithinValidTimeWindow(
    now: Date,
    windowStart: Date,
    windowEnd: Date,
    options: {
      includeEarly?: boolean;
      periodType?: PeriodType;
      checkInTime?: Date;
    } = {},
  ): boolean {
    let effectiveStart = windowStart;

    if (options.periodType === PeriodType.OVERTIME && options.checkInTime) {
      // For overtime, use actual check-in time as start
      effectiveStart = options.checkInTime;
    } else if (options.includeEarly) {
      // For regular periods with early window
      effectiveStart = subMinutes(
        windowStart,
        VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      );
    }

    const effectiveEnd = addMinutes(
      windowEnd,
      options.periodType === PeriodType.OVERTIME
        ? VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT
        : VALIDATION_THRESHOLDS.LATE_CHECKOUT,
    );

    return isWithinInterval(now, {
      start: effectiveStart,
      end: effectiveEnd,
    });
  }

  /**
   * Checks if within an overtime period
   */
  private isWithinOvertimePeriod(
    now: Date,
    overtimeInfo: OvertimeContext,
    attendance?: AttendanceRecord | null,
  ): boolean {
    try {
      // For active overtime attendance, use actual times
      if (
        attendance?.type === PeriodType.OVERTIME &&
        attendance.CheckInTime &&
        !attendance.CheckOutTime
      ) {
        return isWithinInterval(now, {
          start: attendance.CheckInTime,
          end: parseISO(`${format(now, 'yyyy-MM-dd')}T${overtimeInfo.endTime}`),
        });
      }

      // Standard overtime period detection
      const referenceDate = format(now, 'yyyy-MM-dd');
      const overtimeStart = parseISO(
        `${referenceDate}T${overtimeInfo.startTime}`,
      );
      let overtimeEnd = parseISO(`${referenceDate}T${overtimeInfo.endTime}`);

      // Handle overnight overtime
      if (overtimeInfo.endTime < overtimeInfo.startTime) {
        overtimeEnd = addDays(overtimeEnd, 1);
      }

      // Broader window for overtime detection
      const earlyWindow = subMinutes(
        overtimeStart,
        VALIDATION_THRESHOLDS.OT_EARLY_CHECKIN,
      );
      const lateWindow = addMinutes(
        overtimeEnd,
        VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT,
      );

      return isWithinInterval(now, {
        start: earlyWindow,
        end: lateWindow,
      });
    } catch (error) {
      console.error('Overtime period detection error:', error);
      return false;
    }
  }

  /**
   * Validates early overtime check-in
   */
  private validateEarlyOvertime(
    overtimeInfo: OvertimeContext,
    now: Date,
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } | null {
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
    );
    const earlyWindow = subMinutes(
      overtimeStart,
      VALIDATION_THRESHOLDS.EARLY_CHECKIN,
    );

    if (now < earlyWindow) {
      return {
        errors: [],
        warnings: [
          {
            code: 'EARLY_OVERTIME',
            message: `Wait for overtime start at ${overtimeInfo.startTime}`,
            details: {
              startTime: overtimeInfo.startTime,
              minutesEarly: differenceInMinutes(overtimeStart, now),
            },
          },
        ],
      };
    }

    return null;
  }

  /**
   * Determines if check-in is allowed
   */
  private canCheckIn(
    currentState: UnifiedPeriodState,
    statusInfo: PeriodStatusInfo,
    now: Date,
  ): boolean {
    // If there's already an active attendance, can't check in
    if (statusInfo.isActiveAttendance) {
      return false;
    }

    const periodStart = parseISO(currentState.timeWindow.start);

    // Early window start: periodStart - EARLY_CHECKIN_THRESHOLD
    const earlyWindow = subMinutes(
      periodStart,
      VALIDATION_THRESHOLDS.EARLY_CHECKIN,
    );

    // Late window end: periodStart + LATE_CHECKIN_THRESHOLD
    const lateWindow = addMinutes(
      periodStart,
      VALIDATION_THRESHOLDS.LATE_CHECKIN,
    );

    // Can check in if within the valid window (including early and late periods)
    return isWithinInterval(now, {
      start: earlyWindow,
      end: lateWindow,
    });
  }

  /**
   * Determines if overtime can be started
   */
  private canStartOvertime(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): boolean {
    if (!window.overtimeInfo) return false;

    // Add overtime period check
    return (
      this.isWithinOvertimePeriod(now, window.overtimeInfo, null) ||
      this.isWithinValidTimeWindow(
        now,
        parseISO(
          `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
        ),
        parseISO(`${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.endTime}`),
        { includeEarly: true },
      )
    );
  }

  /**
   * Creates a time window validation error
   */
  private createTimeWindowError(
    now: Date,
    windowStart: Date,
    windowEnd: Date,
  ): ValidationError {
    return {
      code: 'OUTSIDE_TIME_WINDOW',
      message: 'Current time is outside allowed time window',
      severity: 'error',
      timestamp: now,
      details: {
        currentTime: format(now, 'HH:mm:ss'),
        windowStart: format(windowStart, 'HH:mm:ss'),
        windowEnd: format(windowEnd, 'HH:mm:ss'),
      },
    };
  }

  /**
   * Creates a late check-in warning
   */
  private createLateCheckInWarning(
    now: Date,
    periodStart: Date,
  ): ValidationWarning {
    return {
      code: 'LATE_CHECK_IN',
      message: 'Late check-in detected',
      details: {
        minutesLate: differenceInMinutes(now, periodStart),
        threshold: VALIDATION_THRESHOLDS.LATE_CHECKIN,
      },
    };
  }

  /**
   * Checks if time1 is before time2 (HH:MM format)
   */
  private isBeforeShift(time1: string, time2: string): boolean {
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    return hours1 * 60 + minutes1 < hours2 * 60 + minutes2;
  }

  /**
   * Calculates shift timing
   */
  private calculateShiftTiming(
    shift: ShiftData,
    now: Date,
  ): {
    isMorningShift: boolean;
    isAfternoonShift: boolean;
    isAfterMidshift: boolean;
  } {
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${shift.startTime}`,
    );
    const shiftEnd = parseISO(`${format(now, 'yyyy-MM-dd')}T${shift.endTime}`);
    const midShift = addMinutes(
      shiftStart,
      differenceInMinutes(shiftEnd, shiftStart) / 2,
    );

    return {
      isMorningShift: parseInt(shift.startTime.split(':')[0], 10) < 12,
      isAfternoonShift: parseInt(shift.startTime.split(':')[0], 10) >= 12,
      isAfterMidshift: now >= midShift,
    };
  }

  /**
   * Gets applied validation rules
   */
  private getAppliedRules(
    currentState: UnifiedPeriodState,
    activeRecord: AttendanceRecord | null,
  ): string[] {
    const rules = ['TIME_WINDOW', 'STATE'];

    if (activeRecord) {
      rules.push('ACTIVE_ATTENDANCE');
    }

    if (currentState.type === PeriodType.OVERTIME) {
      rules.push('OVERTIME');
    }

    if (currentState.validation.isOvernight) {
      rules.push('OVERNIGHT');
    }

    return rules;
  }

  /**
   * Finds recently completed overtime
   * Note: Currently not called directly but kept for potential future use
   */
  private findRecentlyCompletedOvertime(
    attendance: AttendanceRecord | null,
    now: Date,
    thresholdMinutes: number,
  ): AttendanceRecord | null {
    if (!attendance || !attendance.CheckOutTime) return null;

    const checkoutTime = new Date(attendance.CheckOutTime);
    const minutesSinceCheckout = differenceInMinutes(now, checkoutTime);

    if (
      attendance.type === PeriodType.OVERTIME &&
      minutesSinceCheckout <= thresholdMinutes
    ) {
      return attendance;
    }
    return null;
  }

  /**
   * Handles overnight overtime
   */
  private handleOvernightOvertime(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) {
      return false;
    }

    const periodStart = parseISO(currentState.timeWindow.start);
    const periodEnd = parseISO(currentState.timeWindow.end);

    // Handle overnight periods
    if (periodEnd < periodStart) {
      // For overnight periods, check if we're in the valid range
      const effectiveEnd = addDays(periodEnd, 1);
      return isWithinInterval(now, {
        start: periodStart,
        end: effectiveEnd,
      });
    }

    return false;
  }

  /**
   * Checks if auto-completion is required
   */
  private checkAutoCompletionRequired(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) {
      return false;
    }

    const periodEnd = parseISO(currentState.timeWindow.end);

    // Check different conditions for auto-completion
    const isVeryLate =
      differenceInMinutes(now, periodEnd) >
      VALIDATION_THRESHOLDS.VERY_LATE_CHECKOUT;

    const hasNextPeriodStarted =
      currentState.validation.isConnected &&
      now > addMinutes(periodEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW);

    const isOvernightPastEnd =
      currentState.validation.isOvernight && now > addDays(periodEnd, 1);

    return isVeryLate || hasNextPeriodStarted || isOvernightPastEnd;
  }
}

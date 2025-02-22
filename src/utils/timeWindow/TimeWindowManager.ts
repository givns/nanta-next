// utils/timeWindow/TimeWindowManager.ts
import {
  TimeWindow,
  ShiftData,
  ValidationContext,
  OvertimeContext,
  ApprovedOvertimeInfo,
  AttendanceRecord,
  UnifiedPeriodState,
  TimingFlags,
  PeriodDefinition,
} from '@/types/attendance';
import {
  addMinutes,
  subMinutes,
  isWithinInterval,
  parseISO,
  format,
  addDays,
  differenceInMinutes,
  subDays,
} from 'date-fns';
import { VALIDATION_THRESHOLDS } from '@/types/attendance/interface';
import { PeriodType } from '@prisma/client';

export interface EnhancedTimeWindow extends TimeWindow {
  isTransition?: boolean;
  gracePeriod?: number;
  isEarlyCheckin?: boolean;
  isLateCheckin?: boolean;
}

export interface TimeWindowValidationResult {
  isValid: boolean;
  isEarly: boolean;
  isLate: boolean;
  minutesEarly: number;
  minutesLate: number;
  isWithinEarlyWindow: boolean;
  isWithinLateWindow: boolean;
}

export interface LateCheckInStatus {
  isLate: boolean;
  minutesLate: number;
  isWithinAllowance: boolean;
}

export class TimeWindowManager {
  /**
   * Main window calculation method
   * This is a new method that centralizes time window logic
   */
  calculateTimeWindows(
    periodType: PeriodType,
    shiftData: ShiftData,
    context: ValidationContext,
  ): EnhancedTimeWindow[] {
    const { timestamp } = context;
    const today = format(timestamp, 'yyyy-MM-dd');

    // First calculate base windows
    let windows = this.calculateBaseWindows(today, shiftData);

    // Add overtime windows if present
    if (context.overtimeInfo) {
      const overtimeContext = this.convertToOvertimeContext(
        context.overtimeInfo,
      );
      const overtimeWindow = this.createOvertimeWindow(today, overtimeContext);
      windows.push(overtimeWindow);

      // Adjust overtime windows based on type
      windows = this.adjustOvertimeWindows(windows, overtimeContext, timestamp);
    }

    // Handle transitional periods
    windows = this.handleTransitionalPeriods(windows);

    console.log('Calculated time windows:', {
      windows: windows.map((w) => ({
        type: w.type,
        start: format(w.start, 'HH:mm:ss'),
        end: format(w.end, 'HH:mm:ss'),
        isFlexible: w.isFlexible,
        isEarlyCheckin: w.isEarlyCheckin,
        isLateCheckin: w.isLateCheckin,
      })),
    });

    // Sort windows chronologically
    return this.sortWindows(windows);
  }

  /**
   * Calculate timing flags for a given state and attendance
   * This is the single source of truth for timing flags
   */
  calculateTimingFlags(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): TimingFlags {
    // Calculate early check-in
    const isEarlyCheckIn = this.isEarlyCheckIn(attendance, currentState, now);

    // Calculate late check-in
    const isLateCheckIn = this.isLateCheckIn(attendance, currentState, now);

    // Calculate late checkout flags
    const isLateCheckOut = this.isLateCheckOut(attendance, currentState, now);
    const isEarlyCheckOut = this.isEarlyCheckOut(attendance, currentState, now);
    const isVeryLateCheckOut = this.isVeryLateCheckOut(
      attendance,
      currentState,
      now,
    );

    // Calculate minutes late for checkout
    const lateCheckOutMinutes = this.calculateLateMinutes(
      attendance,
      currentState,
      now,
    );

    // Check if transition is needed
    const requiresTransition = this.requiresTransition(
      attendance,
      currentState,
      now,
    );

    // Check if auto-completion is needed
    const requiresAutoCompletion = this.requiresAutoCompletion(
      attendance,
      currentState,
      now,
    );

    return {
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut,
      isEarlyCheckOut,
      isVeryLateCheckOut,
      lateCheckOutMinutes,
      requiresTransition,
      requiresAutoCompletion,
    };
  }

  /**
   * Validate time window with comprehensive options
   */
  validateTimeWindow(
    now: Date,
    window: TimeWindow,
    options: {
      includeEarlyWindow?: boolean;
      includeLateWindow?: boolean;
      periodType?: PeriodType;
      checkInTime?: Date;
    } = {},
  ): TimeWindowValidationResult {
    const periodStart = window.start;
    const periodEnd = window.end;

    // Determine thresholds based on period type
    const earlyThreshold =
      options.periodType === PeriodType.OVERTIME
        ? VALIDATION_THRESHOLDS.OT_EARLY_CHECKIN
        : VALIDATION_THRESHOLDS.EARLY_CHECKIN;

    const lateThreshold =
      options.periodType === PeriodType.OVERTIME
        ? VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT
        : VALIDATION_THRESHOLDS.LATE_CHECKOUT;

    // Check early window
    const earlyWindowStart = subMinutes(periodStart, earlyThreshold);
    const isWithinEarlyWindow = isWithinInterval(now, {
      start: earlyWindowStart,
      end: periodStart,
    });

    // Check late window
    const lateWindowEnd = addMinutes(periodEnd, lateThreshold);
    const isWithinLateWindow = isWithinInterval(now, {
      start: periodEnd,
      end: lateWindowEnd,
    });

    // Calculate minutes early/late
    const isEarly = now < periodStart;
    const isLate = now > periodEnd;
    const minutesEarly = isEarly ? differenceInMinutes(periodStart, now) : 0;
    const minutesLate = isLate ? differenceInMinutes(now, periodEnd) : 0;

    // Determine if valid based on options
    let isValid = isWithinInterval(now, { start: periodStart, end: periodEnd });

    if (options.includeEarlyWindow && isWithinEarlyWindow) {
      isValid = true;
    }

    if (options.includeLateWindow && isWithinLateWindow) {
      isValid = true;
    }

    return {
      isValid,
      isEarly,
      isLate,
      minutesEarly,
      minutesLate,
      isWithinEarlyWindow,
      isWithinLateWindow,
    };
  }

  /**
   * Get detailed status for late check-in
   */
  getLateCheckInStatus(
    checkInTime: Date | null,
    periodStart: Date,
    allowanceMinutes: number = VALIDATION_THRESHOLDS.LATE_CHECKIN,
  ): LateCheckInStatus {
    // If no check-in time or check-in before period start, not late
    if (!checkInTime || checkInTime <= periodStart) {
      return {
        isLate: false,
        minutesLate: 0,
        isWithinAllowance: true,
      };
    }

    // Calculate minutes late
    const minutesLate = differenceInMinutes(checkInTime, periodStart);

    // Determine if within allowance
    const isWithinAllowance = minutesLate <= allowanceMinutes;

    return {
      isLate: minutesLate > 0,
      minutesLate,
      isWithinAllowance,
    };
  }

  /**
   * Check if a date is within valid bounds of a window
   */
  isWithinValidBounds(now: Date, window: EnhancedTimeWindow): boolean {
    // For regular windows, we need to handle both early and late check-in differently
    if (window.type === PeriodType.REGULAR && !window.isTransition) {
      // For the main shift window, we should add a late check-in grace period to the start
      if (!window.isFlexible) {
        const earlyStart = subMinutes(
          window.start,
          VALIDATION_THRESHOLDS.EARLY_CHECKIN,
        );
        const lateStart = addMinutes(
          window.start,
          VALIDATION_THRESHOLDS.LATE_CHECKIN,
        );

        // For check-in, consider within bounds if before lateStart
        if (now >= earlyStart && now <= lateStart) {
          return true;
        }

        // Also check if within the regular window
        return isWithinInterval(now, {
          start: window.start,
          end: window.end,
        });
      }
    }

    // Original logic for other windows
    const effectiveStart = window.isTransition
      ? window.start
      : subMinutes(window.start, window.gracePeriod || 0);

    const effectiveEnd = window.isTransition
      ? window.end
      : addMinutes(window.end, window.gracePeriod || 0);

    return isWithinInterval(now, {
      start: effectiveStart,
      end: effectiveEnd,
    });
  }

  /**
   * Check if outside shift hours
   */
  isOutsideShiftHours(now: Date, shiftData: ShiftData): boolean {
    const today = format(now, 'yyyy-MM-dd');
    const shiftStart = parseISO(`${today}T${shiftData.startTime}`);
    const shiftEnd = parseISO(`${today}T${shiftData.endTime}`);

    if (this.isOvernightShift(shiftData)) {
      return !isWithinInterval(now, {
        start: shiftStart,
        end: addDays(shiftEnd, 1),
      });
    }

    return !isWithinInterval(now, {
      start: shiftStart,
      end: shiftEnd,
    });
  }

  /**
   * Check if within shift window
   */
  isWithinShiftWindow(
    now: Date,
    shiftData: ShiftData,
    options: { includeEarlyWindow?: boolean; includeLateWindow?: boolean } = {},
  ): boolean {
    const today = format(now, 'yyyy-MM-dd');
    let start = parseISO(`${today}T${shiftData.startTime}`);
    let end = parseISO(`${today}T${shiftData.endTime}`);

    if (options.includeEarlyWindow) {
      start = subMinutes(start, VALIDATION_THRESHOLDS.EARLY_CHECKIN);
    }

    if (options.includeLateWindow) {
      end = addMinutes(end, VALIDATION_THRESHOLDS.LATE_CHECKOUT);
    }

    if (shiftData.endTime < shiftData.startTime) {
      end = addDays(end, 1);
    }

    return isWithinInterval(now, { start, end });
  }

  /**
   * Check if within shift hours
   */
  isWithinShiftHours(now: Date, window: TimeWindow): boolean {
    const today = format(now, 'yyyy-MM-dd');
    const start = parseISO(`${today}T${format(window.start, 'HH:mm:ss')}`);
    let end = parseISO(`${today}T${format(window.end, 'HH:mm:ss')}`);

    if (end < start) {
      end = addDays(end, 1);
    }

    return isWithinInterval(now, { start, end });
  }

  private isWithinOvernightPeriod(
    now: Date,
    reference: Date,
    period: PeriodDefinition,
  ): boolean {
    let periodStart = this.parseTimeWithContext(period.startTime, reference);
    let periodEnd = this.parseTimeWithContext(period.endTime, reference);

    // If it's an overnight period and end time is before start time
    if (period.isOvernight && period.endTime < period.startTime) {
      periodEnd = addDays(periodEnd, 1);
    }

    // If we're after midnight but before period end
    const currentHour = now.getHours();
    const endHour = parseInt(period.endTime.split(':')[0], 10);

    if (currentHour < 6 && endHour < 12) {
      // We're likely in the early morning part of an overnight period
      periodStart = subDays(periodStart, 1);
    }

    console.log('Overnight period check:', {
      currentTime: format(now, 'HH:mm:ss'),
      periodStart: format(periodStart, 'yyyy-MM-dd HH:mm:ss'),
      periodEnd: format(periodEnd, 'yyyy-MM-dd HH:mm:ss'),
      isWithin: isWithinInterval(now, { start: periodStart, end: periodEnd }),
    });

    return isWithinInterval(now, { start: periodStart, end: periodEnd });
  }

  /**
   * Calculate base windows for a shift
   */
  private calculateBaseWindows(
    today: string,
    shiftData: ShiftData,
  ): EnhancedTimeWindow[] {
    // Regular shift window
    const regularWindow: EnhancedTimeWindow = {
      start: parseISO(`${today}T${shiftData.startTime}`),
      end: parseISO(`${today}T${shiftData.endTime}`),
      type: PeriodType.REGULAR,
      isFlexible: false,
      gracePeriod: 0,
    };

    // Early window
    const earlyWindow: EnhancedTimeWindow = {
      start: subMinutes(
        regularWindow.start,
        VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      ),
      end: regularWindow.start,
      type: PeriodType.REGULAR,
      isFlexible: true,
      gracePeriod: VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      isEarlyCheckin: true,
    };

    // NEW: Late check-in window
    const lateCheckInWindow: EnhancedTimeWindow = {
      start: regularWindow.start,
      end: addMinutes(regularWindow.start, VALIDATION_THRESHOLDS.LATE_CHECKIN),
      type: PeriodType.REGULAR,
      isFlexible: true,
      gracePeriod: VALIDATION_THRESHOLDS.LATE_CHECKIN,
      isLateCheckin: true,
    };

    // Late check-out window
    const lateWindow: EnhancedTimeWindow = {
      start: regularWindow.end,
      end: addMinutes(regularWindow.end, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
      type: PeriodType.REGULAR,
      isFlexible: true,
      gracePeriod: VALIDATION_THRESHOLDS.LATE_CHECKOUT,
    };

    return [earlyWindow, lateCheckInWindow, regularWindow, lateWindow];
  }

  /**
   * Create overtime window
   */
  private createOvertimeWindow(
    today: string,
    overtimeInfo: OvertimeContext,
  ): EnhancedTimeWindow {
    return {
      start: parseISO(`${today}T${overtimeInfo.startTime}`),
      end: parseISO(`${today}T${overtimeInfo.endTime}`),
      type: PeriodType.OVERTIME,
      isFlexible: false,
      gracePeriod: VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT,
    };
  }

  /**
   * Adjust overtime windows based on context
   */
  private adjustOvertimeWindows(
    windows: EnhancedTimeWindow[],
    overtimeInfo: OvertimeContext,
    now: Date,
  ): EnhancedTimeWindow[] {
    const overtimeWindow = windows.find((w) => w.type === PeriodType.OVERTIME);
    if (!overtimeWindow) return windows;

    // Handle overnight overtime
    if (this.isOvernightOvertime(overtimeInfo)) {
      return windows.map((w) =>
        w.type === PeriodType.OVERTIME ? { ...w, end: addDays(w.end, 1) } : w,
      );
    }

    // Handle early morning overtime that happens before shift
    if (this.isBeforeShift(overtimeInfo.startTime, overtimeInfo.endTime)) {
      return windows.map((w) => {
        if (w.type === PeriodType.OVERTIME) {
          // Check if we're already past midnight
          const currentHour = now.getHours();
          if (currentHour < 6) {
            // Assuming early morning is before 6 AM
            // We're in the next day, so adjust window to be today
            return w;
          } else {
            // We're in the previous day, so add a day to move to tomorrow
            return {
              ...w,
              start: addDays(w.start, 1),
              end: addDays(w.end, 1),
            };
          }
        }
        return w;
      });
    }

    return windows;
  }

  /**
   * Check if time1 is before time2 (HH:MM format)
   */
  private isBeforeShift(time1: string, time2: string): boolean {
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    return hours1 * 60 + minutes1 < hours2 * 60 + minutes2;
  }

  /**
   * Handle transitional periods
   */
  private handleTransitionalPeriods(
    windows: EnhancedTimeWindow[],
  ): EnhancedTimeWindow[] {
    const result: EnhancedTimeWindow[] = [];

    for (let i = 0; i < windows.length; i++) {
      const currentWindow = windows[i];
      const nextWindow = windows[i + 1];

      result.push(currentWindow);

      if (nextWindow && this.areWindowsConnected(currentWindow, nextWindow)) {
        result.push(this.createTransitionWindow(currentWindow, nextWindow));
      }
    }

    return result;
  }

  /**
   * Create transition window
   */
  private createTransitionWindow(
    current: EnhancedTimeWindow,
    next: EnhancedTimeWindow,
  ): EnhancedTimeWindow {
    return {
      start: subMinutes(current.end, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
      end: addMinutes(current.end, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
      type: next.type,
      isFlexible: true,
      gracePeriod: VALIDATION_THRESHOLDS.TRANSITION_WINDOW,
      isTransition: true,
    };
  }

  /**
   * Check if windows are connected
   */
  private areWindowsConnected(
    current: EnhancedTimeWindow,
    next: EnhancedTimeWindow,
  ): boolean {
    return format(current.end, 'HH:mm') === format(next.start, 'HH:mm');
  }

  /**
   * Convert ApprovedOvertimeInfo to OvertimeContext
   */
  convertToOvertimeContext(overtime: ApprovedOvertimeInfo): OvertimeContext {
    return {
      id: overtime.id,
      startTime: overtime.startTime,
      endTime: overtime.endTime,
      durationMinutes: overtime.durationMinutes,
      reason: overtime.reason || undefined, // Convert null to undefined
      isInsideShiftHours: overtime.isInsideShiftHours,
      isDayOffOvertime: overtime.isDayOffOvertime,
    };
  }

  /**
   * Check if overtime spans overnight
   */
  isOvernightOvertime(overtimeInfo: OvertimeContext): boolean {
    return overtimeInfo.endTime < overtimeInfo.startTime;
  }

  /**
   * Check if shift spans overnight
   */
  isOvernightShift(shiftData: ShiftData): boolean {
    return shiftData.endTime < shiftData.startTime;
  }

  /**
   * Sort windows chronologically
   */
  private sortWindows(windows: EnhancedTimeWindow[]): EnhancedTimeWindow[] {
    return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * Check for early check-in
   */
  isEarlyCheckIn(
    attendance: AttendanceRecord | null,
    state: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (attendance?.CheckInTime) return false;
    const periodStart = parseISO(state.timeWindow.start);
    return isWithinInterval(now, {
      start: subMinutes(periodStart, VALIDATION_THRESHOLDS.EARLY_CHECKIN),
      end: periodStart,
    });
  }

  /**
   * Check for late check-in
   */
  isLateCheckIn(
    attendance: AttendanceRecord | null,
    state: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (attendance?.CheckInTime) return false;
    const periodStart = parseISO(state.timeWindow.start);
    return (
      differenceInMinutes(now, periodStart) > VALIDATION_THRESHOLDS.LATE_CHECKIN
    );
  }

  /**
   * Check for late check-out
   */
  isLateCheckOut(
    attendance: AttendanceRecord | null,
    state: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return false;
    const periodEnd = parseISO(state.timeWindow.end);
    return isWithinInterval(now, {
      start: periodEnd,
      end: addMinutes(periodEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
    });
  }

  /**
   * Check for early check-out
   */
  isEarlyCheckOut(
    attendance: AttendanceRecord | null,
    state: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return false;
    const periodEnd = parseISO(state.timeWindow.end);
    return (
      differenceInMinutes(periodEnd, now) > VALIDATION_THRESHOLDS.EARLY_CHECKOUT
    );
  }

  /**
   * Check for very late check-out
   */
  isVeryLateCheckOut(
    attendance: AttendanceRecord | null,
    state: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return false;
    const periodEnd = parseISO(state.timeWindow.end);
    return (
      differenceInMinutes(now, periodEnd) >
      VALIDATION_THRESHOLDS.VERY_LATE_CHECKOUT
    );
  }

  /**
   * Calculate minutes late for check-out
   */
  calculateLateMinutes(
    attendance: AttendanceRecord | null,
    state: UnifiedPeriodState,
    now: Date,
  ): number {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return 0;
    const periodEnd = parseISO(state.timeWindow.end);
    return Math.max(0, differenceInMinutes(now, periodEnd));
  }

  /**
   * Check if transition is required
   */
  requiresTransition(
    attendance: AttendanceRecord | null,
    state: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return false;
    if (!state.validation.isConnected) return false;

    const periodEnd = parseISO(state.timeWindow.end);
    return isWithinInterval(now, {
      start: subMinutes(periodEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
      end: periodEnd,
    });
  }

  /**
   * Check if auto-completion is required
   */
  requiresAutoCompletion(
    attendance: AttendanceRecord | null,
    state: UnifiedPeriodState,
    now: Date,
  ): boolean {
    return this.isVeryLateCheckOut(attendance, state, now);
  }

  public parseTimeWithContext(timeString: string, referenceDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const result = new Date(referenceDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }
}

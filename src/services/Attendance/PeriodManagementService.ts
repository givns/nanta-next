import {
  PeriodTransition,
  ShiftWindowResponse,
  UnifiedPeriodState,
  AttendanceRecord,
  PeriodDefinition,
  ValidationResult,
  ValidationContext,
  ValidationError,
  ValidationWarning,
  OvertimeContext,
  VALIDATION_THRESHOLDS,
  ApprovedOvertimeInfo,
  ShiftData,
  TransitionInfo,
  PeriodState,
  PeriodStatusInfo,
} from '@/types/attendance';
import { PeriodType, AttendanceState } from '@prisma/client';
import { getCurrentTime } from '@/utils/dateUtils';
import {
  parseISO,
  format,
  isWithinInterval,
  subMinutes,
  addMinutes,
  addDays,
  differenceInMinutes,
  startOfDay,
  endOfDay,
  subDays,
  addHours,
  isAfter,
  isBefore,
} from 'date-fns';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { OvertimeServiceServer } from '../OvertimeServiceServer';

const TRANSITION_CONFIG = {
  EARLY_BUFFER: 15, // 15 minutes before period
  LATE_BUFFER: 15, // 15 minutes after period
} as const;

export class PeriodManagementService {
  constructor(private readonly shiftService: ShiftManagementService) {}

  /**
   * Main entry point for getting current period state
   */
  async getCurrentPeriodState(
    employeeId: string,
    records: AttendanceRecord[],
    now: Date,
  ): Promise<PeriodState> {
    // Get all necessary data upfront
    const [shiftData, overtimeInfo] = await Promise.all([
      this.shiftService.getEffectiveShift(employeeId, now),
      this.shiftService.getOvertimeInfo(employeeId, now),
    ]);

    if (!shiftData) {
      throw new Error('No shift configuration found');
    }

    // Create window response format for period handling
    const windowResponse: ShiftWindowResponse = {
      current: {
        start: format(now, "yyyy-MM-dd'T'HH:mm:ss"),
        end: format(addHours(now, 8), "yyyy-MM-dd'T'HH:mm:ss"),
      },
      type: overtimeInfo ? PeriodType.OVERTIME : PeriodType.REGULAR,
      shift: shiftData.current,
      isHoliday: false,
      isDayOff: !shiftData.current.workDays.includes(now.getDay()),
      isAdjusted: shiftData.isAdjusted,
      overtimeInfo,
    };

    // Find active record
    const activeRecord = this.findActiveRecord(records);

    // Get current period
    const currentState = this.resolveCurrentPeriod(
      activeRecord,
      windowResponse,
      now,
    );

    // Calculate transitions
    const transitions = this.calculatePeriodTransitions(
      currentState,
      windowResponse,
      activeRecord,
      now,
    );

    // Check if we're in overtime period
    const isInOvertimePeriod = overtimeInfo
      ? this.isWithinOvertimePeriod(now, overtimeInfo) // Remove extra argument
      : false;

    // Create validation context
    const validationContext: ValidationContext = {
      employeeId,
      timestamp: now,
      isCheckIn:
        !activeRecord?.CheckInTime || Boolean(activeRecord?.CheckOutTime),
      state: activeRecord?.state,
      checkStatus: activeRecord?.checkStatus,
      overtimeState: activeRecord?.overtimeState,
      attendance: activeRecord || undefined,
      shift: windowResponse.shift,
      periodType: currentState.type,
    };

    // Get validation using validation context
    const validation = await this.validatePeriodState(
      currentState,
      activeRecord,
      windowResponse,
      validationContext, // Pass the validation context
    );

    return {
      current: currentState,
      transitions,
      overtime: overtimeInfo && isInOvertimePeriod ? overtimeInfo : null,
      validation,
    };
  }

  /**
   * Resolves the current period based on active record and period state
   */
  public resolveCurrentPeriod(
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    now: Date,
  ): UnifiedPeriodState {
    console.log('Resolving current period:', {
      currentTime: format(now, 'HH:mm:ss'),
      attendance: attendance
        ? {
            type: attendance.type,
            checkIn: attendance.CheckInTime,
            checkOut: attendance.CheckOutTime,
          }
        : null,
      periodState: {
        overtimeInfo: periodState.overtimeInfo,
        shift: periodState.shift,
      },
    });

    // Build chronological periods sequence
    const periods = this.buildPeriodSequence(
      periodState.overtimeInfo,
      periodState.shift,
      attendance,
      now,
    );

    // Handle active overtime session first
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime
    ) {
      const activePeriod = periods.find(
        (p) =>
          p.type === PeriodType.OVERTIME &&
          this.isWithinOvernightPeriod(now, attendance.CheckInTime!, p),
      );

      if (activePeriod) {
        console.log('Found active overtime period:', {
          periodStart: activePeriod.startTime,
          periodEnd: activePeriod.endTime,
          isOvernight: activePeriod.isOvernight,
        });
        return this.createPeriodState(activePeriod, attendance, now);
      }
    }

    // Handle active regular period
    if (
      attendance?.type === PeriodType.REGULAR &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime
    ) {
      const activePeriod = periods.find((p) => p.type === PeriodType.REGULAR);
      if (activePeriod) {
        return this.createPeriodState(activePeriod, attendance, now);
      }
    }

    // Find relevant period for current time
    const relevantPeriod = this.findRelevantPeriod(periods, now);
    if (!relevantPeriod) {
      console.log('No relevant period found, using default state');
      return this.createDefaultPeriodState(now);
    }

    return this.createPeriodState(relevantPeriod, null, now);
  }

  private findRelevantOvertime(
    overtimes: ApprovedOvertimeInfo[],
    now: Date,
    attendance?: AttendanceRecord | null,
  ): ApprovedOvertimeInfo | null {
    // Sort overtimes chronologically
    const sortedOvertimes = [...overtimes].sort((a, b) => {
      const aStart = this.parseTimeToMinutes(a.startTime);
      const bStart = this.parseTimeToMinutes(b.startTime);
      return aStart - bStart;
    });

    // First check active attendance overtime session
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime
    ) {
      const activeOtCheckIn = new Date(attendance.CheckInTime);
      const matchingOt = sortedOvertimes.find((ot) => {
        const otStart = parseISO(
          `${format(activeOtCheckIn, 'yyyy-MM-dd')}T${ot.startTime}`,
        );
        const otEnd = parseISO(
          `${format(activeOtCheckIn, 'yyyy-MM-dd')}T${ot.endTime}`,
        );

        // Handle overnight overtime
        let adjustedEnd = otEnd;
        if (ot.endTime < ot.startTime) {
          adjustedEnd = addDays(otEnd, 1);
        }

        const checkInTime = format(activeOtCheckIn, 'HH:mm');
        const startTime = format(otStart, 'HH:mm');
        const endTime = format(adjustedEnd, 'HH:mm');

        return checkInTime >= startTime && checkInTime <= endTime;
      });

      if (matchingOt) return matchingOt;
    }

    // If no active session, check for current/upcoming overtime
    return (
      sortedOvertimes.find((ot) => {
        const start = parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.startTime}`);
        let end = parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.endTime}`);

        // Handle overnight overtime
        if (ot.endTime < ot.startTime) {
          end = addDays(end, 1);
        }

        const earlyWindow = subMinutes(
          start,
          VALIDATION_THRESHOLDS.EARLY_CHECKIN,
        );
        const lateWindow = addMinutes(
          end,
          VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT,
        );

        return now >= earlyWindow && now <= lateWindow;
      }) ||
      sortedOvertimes.find((ot) => {
        const start = parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.startTime}`);
        return now < start;
      }) ||
      null
    );
  }

  /**
   * Builds chronological sequence of periods for the day
   */
  private buildPeriodSequence(
    overtimeInfo: OvertimeContext | undefined | null,
    shift: ShiftData,
    attendance: AttendanceRecord | null,
    now: Date,
  ): PeriodDefinition[] {
    const periods: PeriodDefinition[] = [];

    // Add early morning overtime if exists
    if (overtimeInfo && this.isEarlyMorningOvertime(overtimeInfo, shift)) {
      periods.push({
        type: PeriodType.OVERTIME,
        startTime: overtimeInfo.startTime,
        endTime: overtimeInfo.endTime,
        sequence: 1,
        isOvernight: this.isOvernightPeriod(
          overtimeInfo.startTime,
          overtimeInfo.endTime,
        ),
        isDayOff: overtimeInfo.isDayOffOvertime,
      });
    }

    // Add regular shift
    periods.push({
      type: PeriodType.REGULAR,
      startTime: shift.startTime,
      endTime: shift.endTime,
      sequence: periods.length + 1,
      isOvernight: this.isOvernightPeriod(shift.startTime, shift.endTime),
    });

    // Add evening overtime if exists
    if (overtimeInfo && !this.isEarlyMorningOvertime(overtimeInfo, shift)) {
      periods.push({
        type: PeriodType.OVERTIME,
        startTime: overtimeInfo.startTime,
        endTime: overtimeInfo.endTime,
        sequence: periods.length + 1,
        isOvernight: this.isOvernightPeriod(
          overtimeInfo.startTime,
          overtimeInfo.endTime,
        ),
        isDayOff: overtimeInfo.isDayOffOvertime,
      });
    }

    const sortedPeriods = this.sortPeriodsByChronologicalOrder(periods, now);

    console.log('Built period sequence:', {
      periodsCount: sortedPeriods.length,
      periods: sortedPeriods.map((p) => ({
        type: p.type,
        start: p.startTime,
        end: p.endTime,
        isOvernight: p.isOvernight,
      })),
    });

    return sortedPeriods;
  }

  /**
   * Finds the most relevant period for the current time
   */
  private findRelevantPeriod(
    periods: PeriodDefinition[],
    now: Date,
  ): PeriodDefinition | null {
    console.log('Finding relevant period for:', format(now, 'HH:mm:ss'));

    for (const period of periods) {
      let currentPeriodStart = this.parseTimeWithContext(period.startTime, now);
      let currentPeriodEnd = this.parseTimeWithContext(period.endTime, now);

      // Handle overnight periods
      if (period.isOvernight) {
        if (currentPeriodEnd < currentPeriodStart) {
          currentPeriodEnd = addDays(currentPeriodEnd, 1);
        }
        // If we're before midnight but period started yesterday
        if (now < currentPeriodStart) {
          currentPeriodStart = subDays(currentPeriodStart, 1);
          currentPeriodEnd = subDays(currentPeriodEnd, 1);
        }
      }

      // Include early window in check
      const earlyWindow = subMinutes(
        currentPeriodStart,
        VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      );

      if (
        isWithinInterval(now, {
          start: earlyWindow,
          end: addMinutes(
            currentPeriodEnd,
            VALIDATION_THRESHOLDS.LATE_CHECKOUT,
          ),
        })
      ) {
        console.log('Found current period:', {
          type: period.type,
          start: format(currentPeriodEnd, 'HH:mm:ss'),
          end: format(currentPeriodEnd, 'HH:mm:ss'),
        });
        return period;
      }
    }

    // Find next upcoming period
    const nextPeriod = periods.find((period) => {
      const start = this.parseTimeWithContext(period.startTime, now);
      return now < start;
    });

    if (nextPeriod) {
      console.log('Found upcoming period:', {
        type: nextPeriod.type,
        start: nextPeriod.startTime,
      });
    }

    return nextPeriod || null; // Ensure null instead of undefined
  }

  /**
   * Creates a period state object from a period definition
   */
  private createPeriodState(
    period: PeriodDefinition,
    attendance: AttendanceRecord | null,
    now: Date,
  ): UnifiedPeriodState {
    const periodStart = this.parseTimeWithContext(period.startTime, now);
    let periodEnd = this.parseTimeWithContext(period.endTime, now);

    // Adjust end time for overnight periods
    if (period.isOvernight && periodEnd < periodStart) {
      periodEnd = addDays(periodEnd, 1);
    }

    const isWithinPeriod = isWithinInterval(now, {
      start: periodStart,
      end: periodEnd,
    });

    return {
      type: period.type,
      timeWindow: {
        start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
      activity: {
        isActive: Boolean(attendance?.CheckInTime && !attendance?.CheckOutTime),
        checkIn: attendance?.CheckInTime
          ? format(
              new Date(attendance.CheckInTime),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            )
          : null,
        checkOut: attendance?.CheckOutTime
          ? format(
              new Date(attendance.CheckOutTime),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            )
          : null,
        isOvertime: period.type === PeriodType.OVERTIME,
        isDayOffOvertime: Boolean(period.isDayOff),
        isInsideShiftHours:
          period.type === PeriodType.REGULAR && isWithinPeriod,
      },
      validation: {
        isWithinBounds: isWithinPeriod,
        isEarly: now < periodStart,
        isLate: now > periodEnd,
        isOvernight: period.isOvernight || false,
        isConnected: Boolean(attendance?.overtimeState === 'COMPLETED'),
      },
    };
  }

  public calculatePeriodStatusInfo(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    periodState: ShiftWindowResponse,
    now: Date,
  ): PeriodStatusInfo {
    // Reuse existing shift timing logic
    const shiftTiming = this.calculateShiftTiming(periodState.shift, now);

    const timingFlags = this.calculateTimingFlags(
      attendance,
      currentState,
      now,
    );

    return {
      isActiveAttendance: Boolean(
        attendance?.CheckInTime && !attendance?.CheckOutTime,
      ),
      isOvertimePeriod: currentState.type === PeriodType.OVERTIME,
      timingFlags,
      shiftTiming,
    };
  }

  // Add or update helper method for shift timing
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

  // Update existing or add calculateTimingFlags
  private calculateTimingFlags(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): {
    isEarlyCheckIn: boolean;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    isVeryLateCheckOut: boolean;
    lateCheckOutMinutes: number;
  } {
    const periodStart = parseISO(currentState.timeWindow.start);
    const periodEnd = parseISO(currentState.timeWindow.end);

    // Use existing isWithinBounds logic if available
    const isEarlyCheckIn =
      !attendance?.CheckInTime &&
      this.isEarlyForPeriod(now, currentState.timeWindow.start);

    const isLateCheckIn =
      !attendance?.CheckInTime &&
      this.isLateForPeriod(
        now,
        periodStart,
        VALIDATION_THRESHOLDS.LATE_CHECKIN,
      );

    const isLateCheckOut = this.isLateCheckOut(attendance, currentState, now);

    const isVeryLateCheckOut = this.isVeryLateCheckOut(
      attendance,
      currentState,
      now,
    );

    return {
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut,
      isVeryLateCheckOut,
      lateCheckOutMinutes: this.calculateLateMinutes(
        attendance,
        currentState,
        now,
      ),
    };
  }

  /**
   * Calculates period transitions
   */
  public calculatePeriodTransitions(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    activeRecord: AttendanceRecord | null,
    now: Date,
  ): PeriodTransition[] {
    if (!window.overtimeInfo || !window.shift?.endTime || !window.shift?.id) {
      return [];
    }

    console.log('Calculating transitions:', {
      currentPeriod: currentState.type,
      hasActiveRecord: !!activeRecord,
      overtimeInfo: window.overtimeInfo,
    });

    // Don't process transitions for active records
    if (activeRecord?.CheckInTime && !activeRecord?.CheckOutTime) {
      return [];
    }

    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const transitionWindow = {
      start: subMinutes(shiftEnd, TRANSITION_CONFIG.EARLY_BUFFER),
      end: addMinutes(shiftEnd, TRANSITION_CONFIG.LATE_BUFFER),
    };

    const isInTransitionWindow = isWithinInterval(now, transitionWindow);
    const hasUpcomingOvertime =
      window.overtimeInfo.startTime === window.shift.endTime;

    if (isInTransitionWindow && hasUpcomingOvertime) {
      console.log('Found valid transition:', {
        from: PeriodType.REGULAR,
        to: PeriodType.OVERTIME,
        transitionTime: window.shift.endTime,
      });

      return [
        {
          from: {
            periodIndex: 0,
            type: PeriodType.REGULAR,
          },
          to: {
            periodIndex: 1,
            type: PeriodType.OVERTIME,
          },
          transitionTime: window.shift.endTime,
          isComplete: false,
        },
      ];
    }

    return [];
  }

  /**
   * Determines transition context
   */
  private determineTransitionContext(
    currentState: UnifiedPeriodState,
    transitions: PeriodTransition[],
    window: ShiftWindowResponse,
    now: Date,
  ): TransitionInfo | undefined {
    if (transitions.length === 0 || !window.overtimeInfo) {
      return undefined;
    }

    // Add check for early overtime - no transition needed
    const isEarlyOvertime = this.isBeforeShift(
      window.overtimeInfo.startTime,
      window.shift.startTime,
    );

    if (isEarlyOvertime) {
      return undefined;
    }

    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
    );

    // Pre-shift overtime (early morning)
    if (overtimeStart < shiftStart) {
      const preShiftTransitionWindow = {
        start: subMinutes(overtimeStart, TRANSITION_CONFIG.EARLY_BUFFER),
        end: overtimeStart,
      };

      if (isWithinInterval(now, preShiftTransitionWindow)) {
        return {
          from: {
            type: PeriodType.REGULAR,
            end: format(overtimeStart, 'HH:mm'),
          },
          to: {
            type: PeriodType.OVERTIME,
            start: window.overtimeInfo.startTime,
          },
          isInTransition: true,
        };
      }
    }

    // Post-shift overtime
    if (overtimeStart >= shiftEnd) {
      const postShiftTransitionWindow = {
        start: subMinutes(shiftEnd, TRANSITION_CONFIG.EARLY_BUFFER),
        end: addMinutes(shiftEnd, TRANSITION_CONFIG.LATE_BUFFER),
      };

      if (isWithinInterval(now, postShiftTransitionWindow)) {
        return {
          from: {
            type: PeriodType.REGULAR,
            end: window.shift.endTime,
          },
          to: {
            type: PeriodType.OVERTIME,
            start: window.overtimeInfo.startTime,
          },
          isInTransition: true,
        };
      }
    }

    return undefined;
  }

  /**
   * Validates period state with context
   */
  private async validatePeriodState(
    currentState: UnifiedPeriodState,
    activeRecord: AttendanceRecord | null,
    window: ShiftWindowResponse,
    context: ValidationContext,
  ): Promise<ValidationResult> {
    const now = context.timestamp;
    const periodStart = parseISO(currentState.timeWindow.start);
    const periodEnd = parseISO(currentState.timeWindow.end);

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Time window validation
    if (!this.isWithinValidTimeWindow(now, periodStart, periodEnd)) {
      errors.push(this.createTimeWindowError(now, periodStart, periodEnd));
    }

    // Check-in validation
    if (!activeRecord?.CheckInTime && this.isLateCheckIn(now, periodStart)) {
      warnings.push(this.createLateCheckInWarning(now, periodStart));
    }

    // Active attendance validation
    if (activeRecord?.CheckInTime && !activeRecord?.CheckOutTime) {
      const activeValidation = await this.validateActiveAttendance(
        activeRecord,
        currentState,
        window,
        context,
      );

      errors.push(...activeValidation.errors);
      warnings.push(...activeValidation.warnings);
    }

    // Add overtime period validation
    if (currentState.type === PeriodType.OVERTIME && window.overtimeInfo) {
      const isInOvertimePeriod = this.isWithinOvertimePeriod(
        now,
        window.overtimeInfo,
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
      window.overtimeInfo &&
      this.isBeforeShift(window.overtimeInfo.startTime, window.shift.startTime)
    ) {
      const overtimeValidation = this.validateEarlyOvertime(
        window.overtimeInfo,
        now,
      );

      if (overtimeValidation) {
        errors.push(...overtimeValidation.errors);
        warnings.push(...overtimeValidation.warnings);
      }
    }

    // Build final validation result
    return {
      isValid: errors.length === 0,
      state: activeRecord?.state || AttendanceState.ABSENT,
      errors,
      warnings,
      checkInAllowed: this.canCheckIn(currentState, activeRecord, now),
      checkOutAllowed: this.canCheckOut(currentState, activeRecord, now),
      overtimeAllowed: this.canStartOvertime(currentState, window, now),
      allowedTimeWindows: this.getAllowedTimeWindows(currentState, window),
      metadata: {
        lastValidated: now,
        validatedBy: 'system',
        rules: this.getAppliedRules(currentState, activeRecord),
        requiresTransition: this.checkTransitionRequired(
          currentState,
          activeRecord,
          window,
          now,
        ),
      },
    };
  }

  /**
   * Validates active attendance record
   */
  private async validateActiveAttendance(
    attendance: AttendanceRecord,
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    context: ValidationContext,
  ): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
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

    return { errors, warnings };
  }

  /**
   * Validates early overtime
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
   * Time Window Management
   */
  private isWithinValidTimeWindow(
    now: Date,
    windowStart: Date,
    windowEnd: Date,
    options: { includeEarly?: boolean } = {},
  ): boolean {
    const effectiveStart = options.includeEarly
      ? subMinutes(windowStart, VALIDATION_THRESHOLDS.EARLY_CHECKIN)
      : windowStart;

    const effectiveEnd = addMinutes(
      windowEnd,
      VALIDATION_THRESHOLDS.LATE_CHECKOUT,
    );

    return isWithinInterval(now, {
      start: effectiveStart,
      end: effectiveEnd,
    });
  }

  private getAllowedTimeWindows(
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
      let overtimeStart = parseISO(`${today}T${window.overtimeInfo.startTime}`);
      let overtimeEnd = parseISO(`${today}T${window.overtimeInfo.endTime}`);

      // Handle overnight overtime
      if (overtimeEnd < overtimeStart) {
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

  private isWithinOvertimePeriod(
    now: Date,
    overtimeInfo: OvertimeContext,
    attendance?: AttendanceRecord | null,
  ): boolean {
    try {
      const today = format(now, 'yyyy-MM-dd');
      const overtimeStart = parseISO(`${today}T${overtimeInfo.startTime}`);
      let overtimeEnd = parseISO(`${today}T${overtimeInfo.endTime}`);

      // Handle overnight overtime
      if (overtimeInfo.endTime < overtimeInfo.startTime) {
        overtimeEnd = addDays(overtimeEnd, 1);
      }

      // If we have an active attendance, use its check-in time for validation
      if (attendance?.CheckInTime && !attendance.CheckOutTime) {
        const checkInTime = new Date(attendance.CheckInTime);
        if (attendance.type === PeriodType.OVERTIME) {
          // For active overtime, check if within period from check-in
          return isWithinInterval(now, {
            start: checkInTime,
            end: overtimeEnd,
          });
        }
      }

      // Include early window for check-in
      const earlyWindow = subMinutes(
        overtimeStart,
        VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      );

      return isWithinInterval(now, {
        start: earlyWindow,
        end: addMinutes(overtimeEnd, VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT),
      });
    } catch (error) {
      console.error('Error checking overtime period:', {
        error,
        attendance,
        currentTime: now,
      });
      return false;
    }
  }

  /**
   * Permission Checks
   */
  private canCheckIn(
    currentState: UnifiedPeriodState,
    activeRecord: AttendanceRecord | null,
    now: Date,
  ): boolean {
    // Can't check in if there's an active record
    if (activeRecord?.CheckInTime && !activeRecord?.CheckOutTime) {
      return false;
    }

    const periodStart = parseISO(currentState.timeWindow.start);

    // Allow check-in within window including early buffer
    return this.isWithinValidTimeWindow(
      now,
      periodStart,
      parseISO(currentState.timeWindow.end),
      { includeEarly: true },
    );
  }

  private canCheckOut(
    currentState: UnifiedPeriodState,
    activeRecord: AttendanceRecord | null,
    now: Date,
  ): boolean {
    // Can only check out if there's an active check-in
    if (!activeRecord?.CheckInTime || activeRecord?.CheckOutTime) {
      return false;
    }

    return this.isWithinValidTimeWindow(
      now,
      parseISO(currentState.timeWindow.start),
      parseISO(currentState.timeWindow.end),
    );
  }

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
   * Helper Functions
   */

  private isEarlyForPeriod(now: Date, start: string): boolean {
    const periodStart = parseISO(start);
    return isBefore(now, periodStart);
  }

  private isLateForPeriod(
    now: Date,
    periodEnd: Date,
    threshold: number = VALIDATION_THRESHOLDS.LATE_CHECKIN,
  ): boolean {
    const lateThresholdEnd = addMinutes(periodEnd, threshold);
    return isAfter(now, lateThresholdEnd);
  }

  private isLateCheckOut(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return false;
    const periodEnd = parseISO(currentState.timeWindow.end);
    return isWithinInterval(now, {
      start: periodEnd,
      end: addMinutes(periodEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
    });
  }

  private isVeryLateCheckOut(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return false;
    const periodEnd = parseISO(currentState.timeWindow.end);
    return isAfter(
      now,
      addMinutes(periodEnd, VALIDATION_THRESHOLDS.VERY_LATE_CHECKOUT),
    );
  }

  private calculateLateMinutes(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): number {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return 0;
    const periodEnd = parseISO(currentState.timeWindow.end);
    return Math.max(0, differenceInMinutes(now, periodEnd));
  }

  private findActiveRecord(
    records: AttendanceRecord[],
  ): AttendanceRecord | null {
    return (
      records.find((record) => record.CheckInTime && !record.CheckOutTime) ||
      null
    );
  }

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

  private isBeforeShift(time1: string, time2: string): boolean {
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    return hours1 * 60 + minutes1 < hours2 * 60 + minutes2;
  }

  private isOvernightPeriod(start: string, end: string): boolean {
    try {
      const [startHours, startMinutes] = start.split(':').map(Number);
      const [endHours, endMinutes] = end.split(':').map(Number);
      return endHours * 60 + endMinutes < startHours * 60 + startMinutes;
    } catch (error) {
      console.error('Error checking overnight period:', error);
      return false;
    }
  }

  private parseTimeWithContext(timeString: string, referenceDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const result = new Date(referenceDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

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

  private sortPeriodsByChronologicalOrder(
    periods: PeriodDefinition[],
    now: Date,
  ): PeriodDefinition[] {
    return periods.sort((a, b) => {
      const aTime = this.parseTimeWithContext(a.startTime, now);
      const bTime = this.parseTimeWithContext(b.startTime, now);
      return aTime.getTime() - bTime.getTime();
    });
  }

  private isEarlyMorningOvertime(
    overtime: OvertimeContext,
    shift: ShiftData,
  ): boolean {
    const otStart = this.parseTimeToMinutes(overtime.startTime);
    const shiftStart = this.parseTimeToMinutes(shift.startTime);
    return otStart < shiftStart;
  }

  private parseTimeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private checkTransitionRequired(
    currentState: UnifiedPeriodState,
    activeRecord: AttendanceRecord | null,
    window: ShiftWindowResponse,
    now: Date,
  ): boolean {
    if (!activeRecord || !window.overtimeInfo) {
      return false;
    }

    const periodEnd = parseISO(currentState.timeWindow.end);
    return isWithinInterval(now, {
      start: subMinutes(periodEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
      end: periodEnd,
    });
  }
  private isWithinOvernightPeriod(
    now: Date,
    reference: Date,
    period: PeriodDefinition,
  ): boolean {
    const periodStart = this.parseTimeWithContext(period.startTime, reference);
    let periodEnd = this.parseTimeWithContext(period.endTime, reference);

    if (period.isOvernight) {
      periodEnd = addDays(periodEnd, 1);
    }

    return isWithinInterval(now, { start: periodStart, end: periodEnd });
  }

  private createDefaultPeriodState(now: Date): UnifiedPeriodState {
    return {
      type: PeriodType.REGULAR,
      timeWindow: {
        start: format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
      activity: {
        isActive: false,
        checkIn: null,
        checkOut: null,
        isOvertime: false,
        isDayOffOvertime: false,
        isInsideShiftHours: false,
      },
      validation: {
        isWithinBounds: false,
        isEarly: false,
        isLate: false,
        isOvernight: false,
        isConnected: false,
      },
    };
  }

  private isLateCheckIn(now: Date, start: Date): boolean {
    return differenceInMinutes(now, start) > VALIDATION_THRESHOLDS.LATE_CHECKIN;
  }
  /**
   * New methods taking over from ShiftManagementService
   */
  async getNextDayPeriodState(
    employeeId: string,
    date: Date,
  ): Promise<ShiftWindowResponse> {
    const nextDay = addDays(date, 1);
    const [shiftData, overtimeInfo] = await Promise.all([
      this.shiftService.getEffectiveShift(employeeId, nextDay),
      this.shiftService.getOvertimeInfo(employeeId, nextDay),
    ]);

    if (!shiftData) {
      throw new Error('No shift configuration found for next day');
    }

    return {
      current: {
        start: `${format(nextDay, 'yyyy-MM-dd')}T${shiftData.current.startTime}`,
        end: `${format(nextDay, 'yyyy-MM-dd')}T${shiftData.current.endTime}`,
      },
      type: overtimeInfo ? PeriodType.OVERTIME : PeriodType.REGULAR,
      shift: shiftData.current,
      isHoliday: false,
      isDayOff: !shiftData.current.workDays.includes(nextDay.getDay()),
      isAdjusted: shiftData.isAdjusted,
      overtimeInfo,
    };
  }

  isOutsideShiftHours(now: Date, shiftData: ShiftData): boolean {
    const today = format(now, 'yyyy-MM-dd');
    const shiftStart = parseISO(`${today}T${shiftData.startTime}`);
    const shiftEnd = parseISO(`${today}T${shiftData.endTime}`);

    if (shiftData.endTime < shiftData.startTime) {
      // Overnight shift
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
}

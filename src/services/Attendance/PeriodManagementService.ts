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
  TimingFlags,
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
import { AttendanceEnhancementService } from './AttendanceEnhancementService';

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
            shiftStart: attendance.shiftStartTime,
            shiftEnd: attendance.shiftEndTime,
          }
        : null,
      periodState: {
        overtimeInfo: periodState.overtimeInfo,
        shift: periodState.shift,
      },
    });

    // Handle active overnight overtime first
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime &&
      attendance.shiftStartTime &&
      attendance.shiftEndTime
    ) {
      const isInOvertimeWindow = isWithinInterval(now, {
        start: attendance.CheckInTime,
        end: attendance.shiftEndTime,
      });

      if (isInOvertimeWindow) {
        const activePeriod = {
          type: PeriodType.OVERTIME,
          startTime: format(attendance.shiftStartTime, 'HH:mm'),
          endTime: format(attendance.shiftEndTime, 'HH:mm'),
          sequence: 1,
          isOvernight: true,
          isDayOff: periodState.isDayOff,
        };

        console.log('Found active overnight overtime:', {
          start: format(attendance.shiftStartTime, 'HH:mm'),
          end: format(attendance.shiftEndTime, 'HH:mm'),
          current: format(now, 'HH:mm'),
        });

        return this.createPeriodState(activePeriod, attendance, now);
      }
    }

    const periods = this.buildPeriodSequence(
      periodState.overtimeInfo,
      periodState.shift,
      attendance,
      now,
    );

    // Handle active regular overtime
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime
    ) {
      const activePeriod = periods.find(
        (p) =>
          p.type === PeriodType.OVERTIME &&
          !p.isOvernight &&
          this.isWithinOvernightPeriod(now, attendance.CheckInTime!, p),
      );

      if (activePeriod) {
        console.log('Found active regular overtime period:', {
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

    // Handle active overnight overtime first with proper date context
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime &&
      attendance.shiftStartTime &&
      attendance.shiftEndTime
    ) {
      const checkInTime = new Date(attendance.CheckInTime);
      const shiftEnd = new Date(attendance.shiftEndTime);

      // Properly handle date context for overnight periods
      if (checkInTime <= now && now <= shiftEnd) {
        periods.push({
          type: PeriodType.OVERTIME,
          startTime: format(attendance.shiftStartTime, 'HH:mm'),
          endTime: format(attendance.shiftEndTime, 'HH:mm'),
          sequence: 1,
          isOvernight: true,
          isDayOff: overtimeInfo?.isDayOffOvertime || false,
        });

        // If we have an active overnight period, return only this period
        return periods;
      }
    }

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
        if (now < currentPeriodStart) {
          currentPeriodStart = subDays(currentPeriodStart, 1);
          currentPeriodEnd = subDays(currentPeriodEnd, 1);
        }
      }

      // Include early and late windows
      const earlyWindow = subMinutes(
        currentPeriodStart,
        VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      );
      const lateWindow = addMinutes(
        currentPeriodEnd,
        VALIDATION_THRESHOLDS.LATE_CHECKOUT,
      );

      if (isWithinInterval(now, { start: earlyWindow, end: lateWindow })) {
        console.log('Found current period:', {
          type: period.type,
          start: format(currentPeriodStart, 'HH:mm:ss'),
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

    return nextPeriod || null;
  }

  /**
   * Creates a period state object from a period definition
   */
  private createPeriodState(
    period: PeriodDefinition,
    attendance: AttendanceRecord | null,
    now: Date,
  ): UnifiedPeriodState {
    // For active overtime, use the actual attendance times
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime &&
      attendance.shiftStartTime &&
      attendance.shiftEndTime
    ) {
      return {
        type: period.type,
        timeWindow: {
          start: format(attendance.shiftStartTime, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          end: format(attendance.shiftEndTime, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        },
        activity: {
          isActive: true,
          checkIn: format(attendance.CheckInTime, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          checkOut: null,
          isOvertime: true,
          isDayOffOvertime: Boolean(period.isDayOff),
          isInsideShiftHours: false,
        },
        validation: {
          isWithinBounds: isWithinInterval(now, {
            start: attendance.shiftStartTime,
            end: attendance.shiftEndTime,
          }),
          isEarly: now < attendance.shiftStartTime,
          isLate: now > attendance.shiftEndTime,
          isOvernight: true,
          isConnected: Boolean(attendance.overtimeState === 'COMPLETED'),
        },
      };
    }

    // For non-active periods, use period definition with proper date context
    let contextDate = attendance?.date ? new Date(attendance.date) : now;
    let periodStart = this.parseTimeWithContext(period.startTime, contextDate);
    let periodEnd = this.parseTimeWithContext(period.endTime, contextDate);

    if (period.isOvernight) {
      if (periodEnd < periodStart) {
        periodEnd = addDays(periodEnd, 1);
      }
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
        isActive: false,
        checkIn: null,
        checkOut: null,
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
  ): TimingFlags {
    const periodStart = parseISO(currentState.timeWindow.start);
    const periodEnd = parseISO(currentState.timeWindow.end);

    // Use existing isWithinBounds logic if available
    const isEarlyCheckIn =
      !attendance?.CheckInTime &&
      this.isEarlyForPeriod(
        now,
        currentState.timeWindow.start,
        currentState.type,
      );

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

    // Calculate if transition is required - typically when approaching next period
    const requiresTransition = Boolean(
      attendance?.CheckInTime &&
        !attendance.CheckOutTime &&
        isWithinInterval(now, {
          start: subMinutes(periodEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
          end: periodEnd,
        }),
    );

    // Calculate if auto-completion is needed (very late checkouts)
    const requiresAutoCompletion = Boolean(
      attendance?.CheckInTime && !attendance.CheckOutTime && isVeryLateCheckOut,
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
      requiresTransition,
      requiresAutoCompletion,
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

    const statusInfo: PeriodStatusInfo = {
      isActiveAttendance: Boolean(
        activeRecord?.CheckInTime && !activeRecord?.CheckOutTime,
      ),
      isOvertimePeriod: currentState.type === PeriodType.OVERTIME,
      timingFlags: this.calculateTimingFlags(
        activeRecord,
        currentState,
        context.timestamp,
      ),
      shiftTiming: this.calculateShiftTiming(window.shift, context.timestamp),
    };

    // Time window validation
    if (!this.isWithinValidTimeWindow(now, periodStart, periodEnd)) {
      errors.push(this.createTimeWindowError(now, periodStart, periodEnd));
    }

    // Check-in validation
    if (!activeRecord?.CheckInTime && this.isLateCheckIn(now, periodStart)) {
      warnings.push(this.createLateCheckInWarning(now, periodStart));
    }

    // Active attendance validation - update the call
    if (activeRecord?.CheckInTime && !activeRecord?.CheckOutTime) {
      const activeValidation = await this.validateActiveAttendance(
        activeRecord,
        currentState,
        statusInfo,
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
      checkInAllowed: this.canCheckIn(
        currentState,
        statusInfo,
        context.timestamp,
      ),
      checkOutAllowed: this.canCheckOut(
        currentState,
        statusInfo,
        context.timestamp,
      ),
      overtimeAllowed: this.canStartOvertime(
        currentState,
        window,
        context.timestamp,
      ),
      allowedTimeWindows: this.getAllowedTimeWindows(currentState, window),
      metadata: {
        lastValidated: context.timestamp,
        validatedBy: 'system',
        rules: this.getAppliedRules(currentState, activeRecord),
        requiresTransition: this.checkTransitionRequired(
          currentState,
          activeRecord,
          window,
          context.timestamp,
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
    statusInfo: PeriodStatusInfo, // Add this parameter
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

    // Validate check-out timing using statusInfo
    if (statusInfo.isActiveAttendance) {
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
      // Get reference date based on now
      const referenceDate = format(now, 'yyyy-MM-dd');
      let overtimeStart = parseISO(
        `${referenceDate}T${overtimeInfo.startTime}`,
      );
      let overtimeEnd = parseISO(`${referenceDate}T${overtimeInfo.endTime}`);

      // Handle overnight overtime properly
      if (overtimeInfo.endTime < overtimeInfo.startTime) {
        // If we're before the start time, reference previous day's overtime
        if (now < overtimeStart) {
          overtimeStart = subDays(overtimeStart, 1);
          overtimeEnd = subDays(overtimeEnd, 1);
        } else {
          overtimeEnd = addDays(overtimeEnd, 1);
        }
      }

      // For active overtime attendance
      if (
        attendance?.type === PeriodType.OVERTIME &&
        attendance.CheckInTime &&
        !attendance.CheckOutTime
      ) {
        const checkInTime = new Date(attendance.CheckInTime);
        const shiftEnd = attendance.shiftEndTime
          ? new Date(attendance.shiftEndTime)
          : overtimeEnd;

        return isWithinInterval(now, {
          start: checkInTime,
          end: shiftEnd,
        });
      }

      // For new check-ins, include early window
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
    currentState: UnifiedPeriodState, // Keep this UnifiedPeriodState
    statusInfo: PeriodStatusInfo, // Add separate PeriodStatusInfo param
    now: Date,
  ): boolean {
    if (statusInfo.isActiveAttendance) {
      return false;
    }

    const periodStart = parseISO(currentState.timeWindow.start);
    return isWithinInterval(now, {
      start: subMinutes(periodStart, VALIDATION_THRESHOLDS.EARLY_CHECKIN),
      end: addMinutes(periodStart, VALIDATION_THRESHOLDS.LATE_CHECKIN),
    });
  }

  private canCheckOut(
    currentState: UnifiedPeriodState,
    statusInfo: PeriodStatusInfo,
    now: Date,
  ): boolean {
    // Check if PeriodType is properly imported
    console.log('DEBUG: PeriodType enum check:', {
      PeriodType,
      comparison: {
        currentType: currentState.type,
        overtimeType: PeriodType.OVERTIME,
        isEqual: currentState.type === PeriodType.OVERTIME,
        typeofCurrentType: typeof currentState.type,
        typeofOvertimeType: typeof PeriodType.OVERTIME,
      },
    });

    if (!statusInfo.isActiveAttendance) {
      return false;
    }

    // Use strict comparison
    const isOvertimePeriod = Object.is(currentState.type, PeriodType.OVERTIME);
    console.log('DEBUG: Strict comparison:', { isOvertimePeriod });

    if (isOvertimePeriod) {
      return true;
    }

    return false;
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

  // 3. Fix early check-in calculation
  private isEarlyForPeriod(
    now: Date,
    start: string,
    type: PeriodType,
  ): boolean {
    const periodStart = parseISO(start);
    const earlyThreshold =
      type === PeriodType.OVERTIME
        ? VALIDATION_THRESHOLDS.EARLY_CHECKIN
        : VALIDATION_THRESHOLDS.EARLY_CHECKIN;

    return isWithinInterval(now, {
      start: subMinutes(periodStart, earlyThreshold),
      end: periodStart,
    });
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
    const [startHours, startMinutes] = start.split(':').map(Number);
    const [endHours, endMinutes] = end.split(':').map(Number);

    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;

    return endTotalMinutes < startTotalMinutes;
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

  // 4. Fix transition requirement logic
  private checkTransitionRequired(
    currentState: UnifiedPeriodState,
    activeRecord: AttendanceRecord | null,
    window: ShiftWindowResponse,
    now: Date,
  ): boolean {
    // No transition needed if no active record
    if (!activeRecord?.CheckInTime || activeRecord?.CheckOutTime) {
      return false;
    }

    // Check for connecting period
    const currentEndTime = format(
      parseISO(currentState.timeWindow.end),
      'HH:mm',
    );
    const nextPeriodStartTime =
      window.overtimeInfo?.startTime || window.nextPeriod?.startTime;

    console.log('Transition check:', {
      currentEndTime,
      nextPeriodStartTime,
      hasConnection: currentEndTime === nextPeriodStartTime,
    });

    // Only require transition if periods are connected
    if (!nextPeriodStartTime || currentEndTime !== nextPeriodStartTime) {
      return false;
    }

    // Check if within transition window
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
    let periodStart = this.parseTimeWithContext(period.startTime, reference);
    let periodEnd = this.parseTimeWithContext(period.endTime, reference);

    // If it's an overnight period and end time is before start time
    if (period.isOvernight && period.endTime < period.startTime) {
      periodEnd = addDays(periodEnd, 1);
    }

    // If we're after midnight but before period end
    if (now < periodStart && period.isOvernight) {
      periodStart = subDays(periodStart, 1);
      periodEnd = subDays(periodEnd, 1);
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

    // Fix: Ensure boolean return type
    return isWithinInterval(now, { start, end });
  }
}

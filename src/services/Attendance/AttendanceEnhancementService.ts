import {
  AttendanceStateResponse,
  SerializedAttendanceRecord,
  ShiftWindowResponse,
  ValidationContext,
  UnifiedPeriodState,
  ValidationError,
  ValidationWarning,
  AttendanceRecord,
  PeriodTransition,
  TransitionInfo,
  ValidationMetadata,
  VALIDATION_THRESHOLDS,
  ValidationFlags,
  StateValidation,
  PeriodStatusInfo,
  TransitionStatusInfo,
  AttendanceStatusResponse,
  TimeEntry,
  SerializedTimeEntry,
  SerializedOvertimeEntry,
  OvertimeEntry,
  OvertimeContext,
  TimingFlags,
} from '@/types/attendance';
import {
  AttendanceState,
  CheckStatus,
  PeriodType,
  OvertimeState,
} from '@prisma/client';
import {
  parseISO,
  format,
  isWithinInterval,
  addMinutes,
  subMinutes,
  differenceInMinutes,
  addDays,
  addHours,
} from 'date-fns';
import { PeriodManagementService } from './PeriodManagementService';
import { VALIDATION_ACTIONS } from '@/types/attendance/interface';

export class AttendanceEnhancementService {
  constructor(private readonly periodManager: PeriodManagementService) {}

  async enhanceAttendanceStatus(
    serializedAttendance: SerializedAttendanceRecord | null,
    periodState: ShiftWindowResponse,
    validationContext: ValidationContext,
  ): Promise<AttendanceStatusResponse> {
    console.log('enhanceAttendanceStatus Input Debug:', {
      periodStateOvertimeInfo: periodState.overtimeInfo
        ? {
            startTime: periodState.overtimeInfo.startTime,
            endTime: periodState.overtimeInfo.endTime,
            id: periodState.overtimeInfo.id,
            durationMinutes: periodState.overtimeInfo.durationMinutes,
            isInsideShiftHours: periodState.overtimeInfo.isInsideShiftHours,
            isDayOffOvertime: periodState.overtimeInfo.isDayOffOvertime,
          }
        : 'UNDEFINED',
      validationContextTimestamp: validationContext.timestamp.toISOString(),
    });

    const now = validationContext.timestamp;

    // Deserialize attendance record
    const attendance = serializedAttendance
      ? this.deserializeAttendanceRecord(serializedAttendance)
      : null;

    // Get current period state
    const currentState = this.periodManager.resolveCurrentPeriod(
      attendance,
      periodState,
      now,
      periodState,
    );

    // Get period status info
    const statusInfo = this.determinePeriodStatusInfo(
      attendance,
      currentState,
      periodState,
      now,
    );

    console.log('After determinePeriodStatusInfo Debug:', {
      periodStateOvertimeInfo: periodState.overtimeInfo
        ? {
            startTime: periodState.overtimeInfo.startTime,
            endTime: periodState.overtimeInfo.endTime,
            id: periodState.overtimeInfo.id,
          }
        : 'UNDEFINED',
    });

    // Calculate transitions
    const transitions = this.periodManager.calculatePeriodTransitions(
      currentState,
      periodState,
      attendance,
      now,
    );

    // Get transition status
    const transitionStatus = this.determineTransitionStatusInfo(
      statusInfo,
      periodState,
      transitions,
      now,
    );

    console.log('After determineTransitionStatusInfo Debug:', {
      periodStateOvertimeInfo: periodState.overtimeInfo
        ? {
            startTime: periodState.overtimeInfo.startTime,
            endTime: periodState.overtimeInfo.endTime,
            id: periodState.overtimeInfo.id,
          }
        : 'UNDEFINED',
    });

    // Create enhanced context for validation
    const enhancedContext: ValidationContext = {
      ...validationContext,
      attendance: attendance || undefined,
      periodType: currentState.type,
      isOvertime:
        currentState.type === PeriodType.OVERTIME ||
        Boolean(statusInfo.isOvertimePeriod),
    };

    // Create state validation
    const stateValidation = this.createStateValidation(
      currentState,
      attendance,
      periodState,
      enhancedContext,
      statusInfo,
      transitionStatus,
    );

    return this.buildEnhancedResponse(
      attendance,
      currentState,
      periodState,
      transitions,
      stateValidation,
      statusInfo,
      transitionStatus,
      now,
    );
  }

  /**
   * State Validation
   */
  private createStateValidation(
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    context: ValidationContext,
    statusInfo: PeriodStatusInfo,
    transitionStatus: TransitionStatusInfo,
  ): StateValidation {
    console.log('DEBUG createStateValidation input:', {
      currentStateType: currentState.type,
      statusInfo: {
        isActiveAttendance: statusInfo.isActiveAttendance,
        isOvertimePeriod: statusInfo.isOvertimePeriod,
      },
      timestamp: format(context.timestamp, 'yyyy-MM-dd HH:mm:ss'),
    });

    // Get permission flags once
    const checkinAllowed = this.canCheckIn(
      currentState,
      statusInfo,
      context.timestamp,
    );
    const checkoutAllowed = this.canCheckOut(
      currentState,
      statusInfo,
      context.timestamp,
    );
    console.log('DEBUG after canCheckOut:', { checkoutAllowed });

    console.log('Validation preparation:', {
      checkoutAllowed,
      type: currentState.type,
      active: statusInfo.isActiveAttendance,
      timestamp: format(context.timestamp, 'yyyy-MM-dd HH:mm:ss'),
    });

    // Build validation flags
    const flags = this.buildValidationFlags(
      statusInfo,
      currentState,
      attendance,
      periodState,
    );

    const validation = {
      allowed: checkinAllowed || checkoutAllowed, // Use stored values
      reason: this.getValidationMessage(statusInfo, currentState, attendance),
      flags,
      metadata: transitionStatus.isInTransition
        ? {
            nextTransitionTime: format(
              transitionStatus.window.end,
              "yyyy-MM-dd'T'HH:mm:ss",
            ),
            requiredAction: flags.requiresTransition
              ? VALIDATION_ACTIONS.TRANSITION_REQUIRED
              : flags.requiresAutoCompletion
                ? VALIDATION_ACTIONS.AUTO_COMPLETE
                : undefined,
            transitionWindow: {
              start: format(
                transitionStatus.window.start,
                "yyyy-MM-dd'T'HH:mm:ss",
              ),
              end: format(transitionStatus.window.end, "yyyy-MM-dd'T'HH:mm:ss"),
              targetPeriod: transitionStatus.targetPeriod,
            },
          }
        : undefined,
    };

    console.log('Final validation:', validation);

    return validation;
  }

  /**
   * Status Information
   */
  private determinePeriodStatusInfo(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    periodState: ShiftWindowResponse,
    now: Date,
  ): PeriodStatusInfo {
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
    );
    const midShift = addMinutes(
      shiftStart,
      differenceInMinutes(shiftEnd, shiftStart) / 2,
    );

    const shiftTiming = {
      isMorningShift:
        parseInt(periodState.shift.startTime.split(':')[0], 10) < 12,
      isAfternoonShift:
        parseInt(periodState.shift.startTime.split(':')[0], 10) >= 12,
      isAfterMidshift: now >= midShift,
    };

    const isActive = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );

    const timingFlags: TimingFlags = {
      isEarlyCheckIn: currentState.validation.isEarly,
      isLateCheckIn: currentState.validation.isLate,
      isLateCheckOut: this.isLateCheckOut(attendance, currentState, now),
      isVeryLateCheckOut: this.isVeryLateCheckOut(
        attendance,
        currentState,
        now,
      ),
      lateCheckOutMinutes: this.calculateLateMinutes(
        attendance,
        currentState,
        now,
      ),
      // Check if transition is needed based on period end approach
      requiresTransition:
        isActive &&
        isWithinInterval(now, {
          start: subMinutes(
            parseISO(currentState.timeWindow.end),
            VALIDATION_THRESHOLDS.TRANSITION_WINDOW,
          ),
          end: parseISO(currentState.timeWindow.end),
        }),
      // Auto-completion needed for very late checkouts in active periods
      requiresAutoCompletion:
        isActive &&
        Boolean(
          attendance?.CheckInTime &&
            !attendance.CheckOutTime &&
            this.isVeryLateCheckOut(attendance, currentState, now),
        ),
    };

    return {
      isActiveAttendance: isActive,
      isOvertimePeriod: currentState.type === PeriodType.OVERTIME,
      timingFlags,
      shiftTiming,
    };
  }

  /**
   * Transition Management
   */
  private determineTransitionStatusInfo(
    statusInfo: PeriodStatusInfo,
    periodState: ShiftWindowResponse,
    transitions: PeriodTransition[],
    now: Date,
  ): TransitionStatusInfo {
    if (transitions.length > 0 && periodState.overtimeInfo) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${periodState.overtimeInfo.startTime}`,
      );

      const transitionStart = subMinutes(
        overtimeStart,
        VALIDATION_THRESHOLDS.TRANSITION_WINDOW,
      );

      if (now >= transitionStart && now < overtimeStart) {
        return {
          isInTransition: true,
          targetPeriod: PeriodType.OVERTIME,
          window: {
            start: transitionStart,
            end: overtimeStart,
          },
        };
      }
    }

    return {
      isInTransition: false,
      targetPeriod: PeriodType.REGULAR,
      window: {
        start: now,
        end: addMinutes(now, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
      },
    };
  }

  /**
   * Response Building
   */
  private buildEnhancedResponse(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    periodState: ShiftWindowResponse,
    transitions: PeriodTransition[],
    stateValidation: StateValidation,
    statusInfo: PeriodStatusInfo,
    transitionStatus: TransitionStatusInfo,
    now: Date,
  ): AttendanceStatusResponse {
    console.log('Building enhanced response with:', {
      hasOvertimeInfo: Boolean(periodState.overtimeInfo),
      overtimeInfo: periodState.overtimeInfo,
    });

    return {
      daily: {
        date: format(now, 'yyyy-MM-dd'),
        currentState: this.buildCurrentState(currentState, statusInfo),
        transitions: this.filterValidTransitions(transitions, transitionStatus),
      },
      base: {
        state: attendance?.state || AttendanceState.ABSENT,
        checkStatus: attendance?.checkStatus || CheckStatus.PENDING,
        isCheckingIn:
          !attendance?.CheckInTime || Boolean(attendance?.CheckOutTime),
        latestAttendance: attendance
          ? this.serializeAttendanceRecord(attendance)
          : null,
        additionalRecords: [], // Default empty array
        periodInfo: {
          type: currentState.type,
          isOvertime: currentState.activity.isOvertime,
          overtimeState: attendance?.overtimeState,
        },
        validation: {
          canCheckIn: stateValidation.allowed && !statusInfo.isActiveAttendance,
          canCheckOut: stateValidation.allowed && statusInfo.isActiveAttendance,
          message: stateValidation.reason,
        },
        metadata: {
          lastUpdated: now.toISOString(),
          version: 1,
          source: attendance?.metadata?.source || 'system',
        },
      },
      context: {
        shift: periodState.shift,
        schedule: {
          isHoliday: periodState.isHoliday,
          isDayOff: periodState.isDayOff,
          isAdjusted: periodState.isAdjusted,
          holidayInfo: periodState.holidayInfo,
        },
        nextPeriod: this.buildNextPeriod(periodState, transitionStatus),
        transition: this.buildTransitionInfo(transitionStatus, periodState),
      },
      validation: stateValidation,
    };
  }

  /**
   * Build current state for daily attendance
   */
  private buildCurrentState(
    currentState: UnifiedPeriodState,
    statusInfo: PeriodStatusInfo,
  ): UnifiedPeriodState {
    // Change return type to UnifiedPeriodState
    return {
      type: currentState.type,
      timeWindow: {
        start: currentState.timeWindow.start,
        end: currentState.timeWindow.end,
      },
      activity: {
        isActive: statusInfo.isActiveAttendance,
        checkIn: currentState.activity.checkIn,
        checkOut: currentState.activity.checkOut,
        isOvertime: currentState.activity.isOvertime,
        isDayOffOvertime: currentState.activity.isDayOffOvertime,
        isInsideShiftHours: currentState.activity.isInsideShiftHours,
      },
      validation: {
        isWithinBounds: currentState.validation.isWithinBounds,
        isEarly: currentState.validation.isEarly,
        isLate: currentState.validation.isLate,
        isOvernight: currentState.validation.isOvernight,
        isConnected: currentState.validation.isConnected,
      },
    };
  }

  /**
   * Filter and validate transitions
   */
  private filterValidTransitions(
    transitions: PeriodTransition[],
    transitionStatus: TransitionStatusInfo,
  ): PeriodTransition[] {
    return transitions.filter(
      (transition) =>
        transition.to.type === transitionStatus.targetPeriod &&
        transitionStatus.isInTransition,
    );
  }

  /**
   * Build next period information
   */
  private buildNextPeriod(
    periodState: ShiftWindowResponse,
    transitionStatus: TransitionStatusInfo,
  ):
    | { type: PeriodType; startTime: string; overtimeInfo?: OvertimeContext }
    | undefined {
    if (!transitionStatus.isInTransition) {
      return undefined;
    }

    return {
      type: transitionStatus.targetPeriod,
      startTime: format(transitionStatus.window.end, "yyyy-MM-dd'T'HH:mm:ss"),
      overtimeInfo: periodState.overtimeInfo,
    };
  }

  /**
   * Build transition information
   */

  private buildTransitionInfo(
    transitionStatus: TransitionStatusInfo,
    periodState: ShiftWindowResponse,
  ): TransitionInfo | undefined {
    if (!transitionStatus.isInTransition || !periodState.overtimeInfo) {
      return undefined;
    }

    return {
      from: {
        type: PeriodType.REGULAR,
        end: format(transitionStatus.window.start, 'HH:mm'),
      },
      to: {
        type: PeriodType.OVERTIME,
        start: periodState.overtimeInfo.startTime,
      },
      isInTransition: true,
    };
  }
  /**
   * Validation Helper Methods
   */
  private buildValidationFlags(
    statusInfo: PeriodStatusInfo,
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
  ): ValidationFlags {
    console.log('Building validation flags:', {
      periodType: currentState.type,
      isActive: statusInfo.isActiveAttendance,
      timeWindow: currentState.timeWindow,
      hasOvertimeInfo: Boolean(periodState.overtimeInfo),
    });

    // Check for connecting period
    const periodEnd = parseISO(currentState.timeWindow.end);
    const currentEndTime = format(periodEnd, 'HH:mm');
    const nextStartTime = periodState.overtimeInfo?.startTime;

    const hasConnectingPeriod = Boolean(
      nextStartTime && currentEndTime === nextStartTime,
    );

    // Only require transition if all conditions met
    const requiresTransition = Boolean(
      statusInfo.isActiveAttendance && // Must be active
        hasConnectingPeriod && // Must have connecting period
        isWithinInterval(new Date(), {
          // Must be in transition window
          start: subMinutes(periodEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
          end: periodEnd,
        }),
    );

    return {
      isCheckingIn: !statusInfo.isActiveAttendance,
      isLateCheckIn: statusInfo.timingFlags.isLateCheckIn,
      isEarlyCheckIn: currentState.validation.isEarly,
      isEarlyCheckOut: false,
      isLateCheckOut: statusInfo.timingFlags.isLateCheckOut,
      isVeryLateCheckOut: statusInfo.timingFlags.isVeryLateCheckOut,

      // Period status
      hasActivePeriod: statusInfo.isActiveAttendance,
      isInsideShift: !currentState.activity.isOvertime,
      isOutsideShift: currentState.activity.isOvertime,
      isOvertime: currentState.activity.isOvertime,
      isDayOffOvertime: currentState.activity.isDayOffOvertime,
      isPendingOvertime: false,

      // Automation flags
      isAutoCheckIn: false,
      isAutoCheckOut: false,
      requireConfirmation: false,
      requiresAutoCompletion: statusInfo.timingFlags.isVeryLateCheckOut,

      // Transition flags
      hasPendingTransition: hasConnectingPeriod, // Update based on connecting period
      requiresTransition, // Use new transition logic

      // Shift timing
      isMorningShift: statusInfo.shiftTiming.isMorningShift,
      isAfternoonShift: statusInfo.shiftTiming.isAfternoonShift,
      isAfterMidshift: statusInfo.shiftTiming.isAfterMidshift,

      // Special cases
      isPlannedHalfDayLeave: false,
      isEmergencyLeave: false,
      isApprovedEarlyCheckout: false,
      isHoliday: periodState.isHoliday,
      isDayOff: periodState.isDayOff,
      isManualEntry: Boolean(attendance?.metadata.isManualEntry),
    };
  }

  private getValidationMessage(
    statusInfo: PeriodStatusInfo,
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
  ): string {
    // Case 1: Active period cases
    if (statusInfo.isActiveAttendance) {
      if (statusInfo.timingFlags.isVeryLateCheckOut) {
        return 'เลยเวลาออกงานมากกว่าที่กำหนด';
      }
      if (statusInfo.timingFlags.isLateCheckOut) {
        return 'เลยเวลาออกงาน';
      }
      return ''; // Active period is fine
    }

    // Case 2: Overnight overtime specific cases
    if (
      currentState.validation.isOvernight &&
      currentState.type === PeriodType.OVERTIME
    ) {
      if (
        attendance?.type === PeriodType.OVERTIME &&
        attendance.CheckInTime &&
        !attendance.CheckOutTime
      ) {
        return `กำลังทำงานล่วงเวลาถึง ${format(
          typeof attendance.shiftEndTime === 'string'
            ? parseISO(attendance.shiftEndTime)
            : attendance.shiftEndTime!,
          'HH:mm',
        )} น.`;
      }
      if (currentState.validation.isEarly) {
        return `เวลาทำงานล่วงเวลาเริ่ม ${format(parseISO(currentState.timeWindow.start), 'HH:mm')} น.`;
      }
      if (currentState.validation.isLate) {
        return 'เลยเวลาเข้างานล่วงเวลา';
      }
    }

    // Case 3: Regular shift timing
    if (currentState.type === PeriodType.REGULAR) {
      if (currentState.validation.isEarly) {
        return `เวลาทำงานปกติเริ่ม ${format(parseISO(currentState.timeWindow.start), 'HH:mm')} น.`;
      }
      if (currentState.validation.isLate) {
        return 'เลยเวลาเข้างานปกติ';
      }
    }

    // Case 4: Regular overtime (non-overnight)
    if (
      currentState.type === PeriodType.OVERTIME &&
      !currentState.validation.isOvernight
    ) {
      if (currentState.validation.isEarly) {
        return `เวลาทำงานล่วงเวลาเริ่ม ${format(parseISO(currentState.timeWindow.start), 'HH:mm')} น.`;
      }
      if (currentState.validation.isLate) {
        return 'เลยเวลาเข้างานล่วงเวลา';
      }
    }

    // Case 5: Active overtime with next period
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime &&
      currentState.validation.isOvernight
    ) {
      if (currentState.validation.isEarly) {
        return `กำลังทำงานล่วงเวลาถึง ${format(
          typeof attendance.shiftEndTime === 'string'
            ? parseISO(attendance.shiftEndTime)
            : attendance.shiftEndTime!,
          'HH:mm',
        )} น. เวลาทำงานล่วงเวลาถัดไปเริ่ม ${format(parseISO(currentState.timeWindow.start), 'HH:mm')} น.`;
      }

      if (currentState.validation.isLate) {
        return 'สิ้นสุดเวลาทำงานล่วงเวลา กรุณาลงเวลาออก';
      }

      return `อยู่ในช่วงเวลาทำงานล่วงเวลาถึง ${format(
        typeof attendance.shiftEndTime === 'string'
          ? parseISO(attendance.shiftEndTime)
          : attendance.shiftEndTime!,
        'HH:mm',
      )} น.`;
    }

    // Case 6: Transition required
    if (statusInfo.timingFlags.requiresTransition) {
      return 'กรุณาลงเวลาออกก่อนเริ่มช่วงเวลาถัดไป';
    }

    // Case 7: Auto-completion required
    if (statusInfo.timingFlags.requiresAutoCompletion) {
      return 'ระบบจะทำการลงเวลาออกให้อัตโนมัติ';
    }

    // Case 8: Day-off overtime
    if (currentState.activity.isDayOffOvertime) {
      return 'ช่วงเวลาทำงานล่วงเวลาวันหยุด';
    }

    // Case 9: Outside all periods
    if (
      !currentState.validation.isWithinBounds &&
      !statusInfo.isActiveAttendance
    ) {
      return 'อยู่นอกช่วงเวลาทำงานที่กำหนด';
    }

    // Default case
    return '';
  }

  /**
   * Permission Check Methods
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

  /**
   * Time Check Methods
   */
  private isLateCheckOut(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return false;
    const periodEnd = parseISO(currentState.timeWindow.end);
    return isWithinInterval(now, {
      start: addMinutes(periodEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
      end: addMinutes(periodEnd, VALIDATION_THRESHOLDS.VERY_LATE_CHECKOUT),
    });
  }

  private isVeryLateCheckOut(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): boolean {
    if (!attendance?.CheckInTime || attendance?.CheckOutTime) return false;
    const periodEnd = parseISO(currentState.timeWindow.end);
    return (
      now > addMinutes(periodEnd, VALIDATION_THRESHOLDS.VERY_LATE_CHECKOUT)
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

  /**
   * Serialization Methods
   */
  private deserializeAttendanceRecord(
    serialized: SerializedAttendanceRecord,
  ): AttendanceRecord {
    return {
      ...serialized,
      date: new Date(serialized.date),
      CheckInTime: serialized.CheckInTime
        ? new Date(serialized.CheckInTime)
        : null,
      CheckOutTime: serialized.CheckOutTime
        ? new Date(serialized.CheckOutTime)
        : null,
      shiftStartTime: serialized.shiftStartTime
        ? new Date(serialized.shiftStartTime)
        : null,
      shiftEndTime: serialized.shiftEndTime
        ? new Date(serialized.shiftEndTime)
        : null,
      metadata: {
        ...serialized.metadata,
        createdAt: new Date(serialized.metadata.createdAt),
        updatedAt: new Date(serialized.metadata.updatedAt),
      },
      timeEntries: this.deserializeTimeEntries(serialized.timeEntries),
      overtimeEntries: this.deserializeOvertimeEntries(
        serialized.overtimeEntries,
      ),
    };
  }

  private serializeAttendanceRecord(
    record: AttendanceRecord,
  ): SerializedAttendanceRecord {
    return {
      ...record,
      date: record.date.toISOString(),
      CheckInTime: record.CheckInTime?.toISOString() || null,
      CheckOutTime: record.CheckOutTime?.toISOString() || null,
      shiftStartTime: record.shiftStartTime?.toISOString() || null,
      shiftEndTime: record.shiftEndTime?.toISOString() || null,
      metadata: {
        ...record.metadata,
        createdAt: record.metadata.createdAt.toISOString(),
        updatedAt: record.metadata.updatedAt.toISOString(),
      },
      timeEntries: record.timeEntries.map((entry) =>
        this.serializeTimeEntry(entry),
      ),
      overtimeEntries: record.overtimeEntries.map((entry) =>
        this.serializeOvertimeEntry(entry),
      ),
    };
  }

  private serializeTimeEntry(entry: TimeEntry): SerializedTimeEntry {
    return {
      ...entry,
      startTime: entry.startTime.toISOString(),
      endTime: entry.endTime?.toISOString() || null,
      metadata: {
        ...entry.metadata,
        createdAt: entry.metadata.createdAt.toISOString(),
        updatedAt: entry.metadata.updatedAt.toISOString(),
      },
    };
  }

  private serializeOvertimeEntry(
    entry: OvertimeEntry,
  ): SerializedOvertimeEntry {
    return {
      ...entry,
      actualStartTime: entry.actualStartTime?.toISOString() || null,
      actualEndTime: entry.actualEndTime?.toISOString() || null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  private deserializeTimeEntries(entries: SerializedTimeEntry[]): TimeEntry[] {
    return entries.map((entry) => ({
      ...entry,
      date: entry.startTime ? new Date(entry.startTime) : new Date(), // Add date field
      startTime: new Date(entry.startTime),
      endTime: entry.endTime ? new Date(entry.endTime) : null,
      metadata: {
        ...entry.metadata,
        createdAt: new Date(entry.metadata.createdAt),
        updatedAt: new Date(entry.metadata.updatedAt),
      },
    }));
  }

  private deserializeOvertimeEntries(
    entries: SerializedOvertimeEntry[],
  ): OvertimeEntry[] {
    return entries.map((entry) => ({
      ...entry,
      actualStartTime: entry.actualStartTime
        ? new Date(entry.actualStartTime)
        : null,
      actualEndTime: entry.actualEndTime ? new Date(entry.actualEndTime) : null,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    }));
  }
}

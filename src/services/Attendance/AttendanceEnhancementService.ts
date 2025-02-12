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
  ATTENDANCE_CONSTANTS,
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
  isAfter,
  isBefore,
  startOfDay,
} from 'date-fns';
import { PeriodManagementService } from './PeriodManagementService';
import { VALIDATION_ACTIONS } from '@/types/attendance/interface';
import { getCurrentTime } from '@/utils/dateUtils';
import { current } from '@reduxjs/toolkit';

interface PeriodValidation {
  canCheckIn: boolean;
  canCheckOut: boolean;
  isLateCheckIn: boolean;
  isWithinLateAllowance: boolean;
}

export class AttendanceEnhancementService {
  constructor(private readonly periodManager: PeriodManagementService) {}

  async enhanceAttendanceStatus(
    serializedAttendance: SerializedAttendanceRecord | null,
    periodState: ShiftWindowResponse,
    validationContext: ValidationContext,
  ): Promise<AttendanceStatusResponse> {
    // Keep existing tracking
    console.log('Enhancement state tracking:', {
      currentTime: format(validationContext.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      hasAttendance: !!serializedAttendance,
      hasOvertimeInfo: !!periodState.overtimeInfo,
      overtimeDetails: periodState.overtimeInfo
        ? {
            id: periodState.overtimeInfo.id,
            startTime: periodState.overtimeInfo.startTime,
            endTime: periodState.overtimeInfo.endTime,
          }
        : null,
    });

    const now = validationContext.timestamp;

    // Keep existing deserialization
    const attendance = serializedAttendance
      ? this.deserializeAttendanceRecord(serializedAttendance)
      : null;

    // Create preserved state that will be used throughout
    const preservedOvertimeInfo = periodState.overtimeInfo
      ? JSON.parse(JSON.stringify(periodState.overtimeInfo))
      : undefined;

    // Ensure overtime info is preserved throughout the process
    const preservedState = {
      ...periodState,
      overtimeInfo: preservedOvertimeInfo,
    };

    // Get current period with preserved state
    const currentState = this.periodManager.resolveCurrentPeriod(
      attendance,
      preservedState, // Use preserved state
      validationContext.timestamp,
      preservedState, // Pass same preserved state as original
    );

    // Get period status with preserved state
    const statusInfo = this.determinePeriodStatusInfo(
      attendance,
      currentState,
      preservedState, // Use preserved state
      now,
    );

    // Calculate transitions with preserved state
    const transitions = this.periodManager.calculatePeriodTransitions(
      currentState,
      preservedState, // Use preserved state
      attendance,
      now,
    );

    // Get transition status with preserved state
    const transitionStatus = this.determineTransitionStatusInfo(
      statusInfo,
      preservedState, // Use preserved state
      transitions,
      now,
    );

    // Rest of the existing validation context creation
    const enhancedContext: ValidationContext = {
      ...validationContext,
      attendance: attendance || undefined,
      periodType: currentState.type,
      isOvertime:
        currentState.type === PeriodType.OVERTIME ||
        Boolean(statusInfo.isOvertimePeriod),
    };

    // Create validation with preserved state
    const stateValidation = this.createStateValidation(
      currentState,
      attendance,
      preservedState, // Use preserved state
      enhancedContext,
      statusInfo,
      transitionStatus,
    );

    // Build response with preserved state
    return this.buildEnhancedResponse(
      attendance,
      currentState,
      preservedState, // Use preserved state
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

    console.log(transitionStatus, {
      isInTransition: transitionStatus.isInTransition,
      targetPeriod: transitionStatus.targetPeriod,
      window: {
        start: format(transitionStatus.window.start, 'yyyy-MM-dd HH:mm:ss'),
        end: format(transitionStatus.window.end, 'yyyy-MM-dd HH:mm:ss'),
      },
    });

    // Get permission flags once
    const periodValidation = this.periodManager.validatePeriodAccess(
      currentState,
      statusInfo,
      context.timestamp,
    );

    // Build validation flags
    const flags = this.buildValidationFlags(
      statusInfo,
      currentState,
      attendance,
      periodState,
      periodValidation,
    );

    const isAllowed =
      flags.isEmergencyLeave ||
      periodValidation.canCheckIn ||
      periodValidation.canCheckOut;

    const validation = {
      allowed: isAllowed, // Use the new calculation
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

    console.log('determine Period Status Info:', {
      isActive,
      isOvertimePeriod: currentState.type === PeriodType.OVERTIME,
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
      requiresTransition:
        isActive &&
        isWithinInterval(now, {
          start: subMinutes(
            parseISO(currentState.timeWindow.end),
            VALIDATION_THRESHOLDS.TRANSITION_WINDOW,
          ),
          end: parseISO(currentState.timeWindow.end),
        }),
      requiresAutoCompletion:
        isActive &&
        Boolean(
          attendance?.CheckInTime &&
            !attendance.CheckOutTime &&
            this.isVeryLateCheckOut(attendance, currentState, now),
        ),
    });

    const timingFlags: TimingFlags = {
      isEarlyCheckIn: currentState.validation.isEarly,
      isLateCheckIn: currentState.validation.isLate,
      isEarlyCheckOut: this.periodManager.calculateTimingFlags(
        attendance,
        currentState,
        now,
      ).isEarlyCheckOut,
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
    // Handle regular to overtime transition
    if (transitions.length > 0 && periodState.overtimeInfo) {
      const shiftEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
      );

      const transitionWindow = {
        start: subMinutes(shiftEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
        end: addMinutes(shiftEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
      };

      // Check if we're in transition window
      if (isWithinInterval(now, transitionWindow)) {
        return {
          isInTransition: true,
          targetPeriod: PeriodType.OVERTIME,
          window: {
            start: shiftEnd,
            end: addMinutes(shiftEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
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
    // Debug current overtime state
    console.log('Building enhanced response:', {
      currentTime: format(now, 'yyyy-MM-dd HH:mm:ss'),
      hasOvertime: !!periodState.overtimeInfo,
      type: currentState.type,
      hasTransitions: transitions.length > 0,
    });

    const today = startOfDay(now);
    const transitionInfo = this.buildTransitionInfo(
      transitionStatus,
      periodState,
    );

    // Build next period info first to ensure overtime is included
    const nextPeriod = this.buildNextPeriod(periodState, transitionStatus);

    // For active overtime, ensure the period and overtime info are properly typed
    const enhancedNextPeriod =
      currentState.type === PeriodType.OVERTIME &&
      statusInfo.isOvertimePeriod &&
      nextPeriod
        ? {
            type: nextPeriod.type,
            startTime: nextPeriod.startTime,
            overtimeInfo:
              nextPeriod.type === PeriodType.OVERTIME
                ? periodState.overtimeInfo
                : undefined,
          }
        : nextPeriod;

    const response = {
      daily: {
        date: format(today, 'yyyy-MM-dd'),
        currentState: this.buildCurrentState(currentState, statusInfo),
        transitions: transitions, // Don't filter
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
          isOvertime:
            currentState.type === PeriodType.OVERTIME ||
            statusInfo.isOvertimePeriod,
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
        nextPeriod: enhancedNextPeriod,
        transition: transitionInfo,
      },
      validation: stateValidation,
    };
    // Single, definitive final state log
    console.log('Final response state:', {
      hasTransitions: response.daily.transitions.length > 0,
      hasShift: Boolean(response.context.shift.id),
      hasOvertime: Boolean(
        response.base.periodInfo.isOvertime ||
          response.context.nextPeriod?.overtimeInfo ||
          periodState.overtimeInfo,
      ),
      transitionState: response.context.transition,
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
    });

    return response;
  }

  /**
   * Build current state for daily attendance
   */
  // In AttendanceEnhancementService.ts
  private buildCurrentState(
    currentState: UnifiedPeriodState,
    statusInfo: PeriodStatusInfo,
    attendance?: AttendanceRecord | null, // Add attendance parameter
  ): UnifiedPeriodState {
    // Change this part
    return {
      type: currentState.type,
      timeWindow: {
        start: currentState.timeWindow.start,
        end: currentState.timeWindow.end,
      },
      activity: {
        isActive: statusInfo.isActiveAttendance,
        // These were coming in as null from somewhere
        checkIn:
          statusInfo.isActiveAttendance && attendance?.CheckInTime
            ? attendance.CheckInTime.toISOString()
            : currentState.activity.checkIn,
        checkOut:
          currentState.activity.checkOut ||
          attendance?.CheckOutTime?.toISOString() ||
          null,
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
    periodValidation: PeriodValidation,
  ): ValidationFlags {
    console.log('Building validation flags from state:', {
      statusInfo: {
        timingFlags: statusInfo.timingFlags,
        shiftTiming: statusInfo.shiftTiming,
        isActiveAttendance: statusInfo.isActiveAttendance,
      },
      currentState: {
        timeWindow: currentState.timeWindow,
        validation: currentState.validation,
        activity: currentState.activity,
      },
    });

    const { timingFlags, shiftTiming } = statusInfo;

    // Check for connecting period
    const periodEnd = parseISO(currentState.timeWindow.end);
    const currentEndTime = format(periodEnd, 'HH:mm');
    const nextStartTime = periodState.overtimeInfo?.startTime;

    const hasConnectingPeriod = Boolean(
      nextStartTime && currentEndTime === nextStartTime,
    );

    const isInsideShift = Boolean(
      currentState.validation.isWithinBounds &&
        !currentState.validation.isEarly &&
        !currentState.validation.isLate,
    );

    // Emergency Leave Logic
    const isEmergencyLeave = Boolean(
      statusInfo.isActiveAttendance && // User is checked in
        !statusInfo.shiftTiming.isAfterMidshift, // Not after midshift
    );
    console.log('Validation flags:', {
      isLateCheckIn: periodValidation.isLateCheckIn,
      isEarlyCheckIn: currentState.validation.isEarly,
      isLateCheckOut: statusInfo.timingFlags.isLateCheckOut,
      isVeryLateCheckOut: statusInfo.timingFlags.isVeryLateCheckOut,
      hasActivePeriod: statusInfo.isActiveAttendance,
      isInsideShift: !currentState.activity.isOvertime,
      isOutsideShift: currentState.activity.isOvertime,
      isOvertime: currentState.activity.isOvertime,
      isDayOffOvertime: currentState.activity.isDayOffOvertime,
      isEmergencyLeave,
      requiresTransition: currentState.validation.isConnected,
      isMorningShift: statusInfo.shiftTiming.isMorningShift,
      isAfternoonShift: statusInfo.shiftTiming.isAfternoonShift,
      isAfterMidshift: statusInfo.shiftTiming.isAfterMidshift,
      isHoliday: periodState.isHoliday,
      isDayOff: periodState.isDayOff,
    });

    return {
      // Activity status - from statusInfo
      isCheckingIn: !statusInfo.isActiveAttendance,
      hasActivePeriod: statusInfo.isActiveAttendance,

      // Timing flags - from statusInfo.timingFlags
      isLateCheckIn: timingFlags.isLateCheckIn,
      isEarlyCheckIn: timingFlags.isEarlyCheckIn,
      isLateCheckOut: timingFlags.isLateCheckOut,
      isVeryLateCheckOut: timingFlags.isVeryLateCheckOut,

      // Shift timing - from statusInfo.shiftTiming
      isMorningShift: shiftTiming.isMorningShift,
      isAfternoonShift: shiftTiming.isAfternoonShift,
      isAfterMidshift: shiftTiming.isAfterMidshift,

      // Period status - from currentState
      isInsideShift,
      isOutsideShift: !isInsideShift,
      isOvertime: currentState.activity.isOvertime,
      isDayOffOvertime: currentState.activity.isDayOffOvertime,

      // Transition flags
      hasPendingTransition: hasConnectingPeriod, // Update based on connecting period
      requiresTransition:
        currentState.validation.isConnected || hasConnectingPeriod,

      // Automation flags - from statusInfo.timingFlags
      requiresAutoCompletion: timingFlags.requiresAutoCompletion,

      // Default flags that need explicit setting elsewhere
      isAutoCheckIn: false,
      isAutoCheckOut: false,
      requireConfirmation: false,
      isPendingOvertime: false,
      isEarlyCheckOut: false,
      isPlannedHalfDayLeave: false,
      isEmergencyLeave,
      isApprovedEarlyCheckout: false,

      // Schedule flags - from periodState
      isHoliday: periodState.isHoliday,
      isDayOff: periodState.isDayOff,

      // Metadata flags
      isManualEntry: Boolean(attendance?.metadata.isManualEntry),
    };
  }

  private getValidationMessage(
    statusInfo: PeriodStatusInfo,
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
  ): string {
    const now = getCurrentTime();
    const periodStart = parseISO(currentState.timeWindow.start);

    if (isBefore(now, periodStart)) {
      return `เวลาทำงานปกติเริ่ม ${format(periodStart, 'HH:mm')} น.`;
    }

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

    // Case 3: Regular shift timing with enhanced late check-in messages
    if (currentState.type === PeriodType.REGULAR) {
      const now = getCurrentTime();
      const periodStart = parseISO(currentState.timeWindow.start);
      const lateThreshold = addMinutes(
        periodStart,
        VALIDATION_THRESHOLDS.LATE_CHECKIN,
      );

      if (currentState.validation.isEarly) {
        return `เวลาทำงานปกติเริ่ม ${format(periodStart, 'HH:mm')} น.`;
      }

      // Handle late check-in cases
      if (isAfter(now, periodStart)) {
        // If within late allowance window
        if (isBefore(now, lateThreshold)) {
          const minutesLate = differenceInMinutes(now, periodStart);
          return `เลยเวลาเข้างานปกติ ${minutesLate} นาที`;
        }
        // If beyond late allowance window
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

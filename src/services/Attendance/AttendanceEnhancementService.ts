import {
  AttendanceRecord,
  ShiftWindowResponse,
  AttendanceStateResponse,
  UnifiedPeriodState,
  StateValidation,
  ShiftContext,
  TransitionContext,
  ATTENDANCE_CONSTANTS,
  OvertimeContext,
  TransitionInfo,
  PeriodStatus,
  PeriodStatusInfo,
  TransitionStatusInfo,
  ValidationFlags,
} from '@/types/attendance';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  addMinutes,
  differenceInMinutes,
  format,
  isBefore,
  isWithinInterval,
  parseISO,
  subMinutes,
} from 'date-fns';
import { PeriodManagementService } from './PeriodManagementService';
import { getCurrentTime } from '@/utils/dateUtils';

interface OvertimeCheckoutStatus {
  shouldAutoComplete: boolean;
  allowManualCheckout: boolean;
  checkoutTime: Date | null;
  reason: string;
}

const VALIDATION_THRESHOLDS = {
  OVERTIME_CHECKOUT: 15, // 15 minutes threshold for overtime checkout
  EARLY_CHECKIN: 30, // 30 minutes before shift start
  LATE_CHECKOUT: 15, // 15 minutes after shift end
} as const;

export class AttendanceEnhancementService {
  constructor(private readonly periodManager: PeriodManagementService) {}

  private determineTransitionContext(
    now: Date,
    periodState: ShiftWindowResponse,
    overtimeInfo?: OvertimeContext | null,
  ): TransitionInfo | undefined {
    if (!overtimeInfo) return undefined;

    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
    );
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
    );

    console.log('Determining transition:', {
      currentTime: format(now, 'HH:mm'),
      shift: {
        start: format(shiftStart, 'HH:mm'),
        end: format(shiftEnd, 'HH:mm'),
      },
      overtime: {
        start: format(overtimeStart, 'HH:mm'),
        startTime: overtimeInfo.startTime,
      },
    });

    // For post-shift overtime (most common case)
    if (overtimeStart >= shiftEnd) {
      const transitionWindow = {
        start: subMinutes(shiftEnd, 15),
        end: shiftEnd,
      };

      const isInTransitionWindow = isWithinInterval(now, transitionWindow);

      if (isInTransitionWindow) {
        return {
          from: {
            type: PeriodType.REGULAR,
            end: periodState.shift.endTime,
          },
          to: {
            type: PeriodType.OVERTIME,
            start: overtimeInfo.startTime,
          },
          isInTransition: true,
        };
      }
    }

    // For pre-shift overtime
    if (overtimeStart < shiftStart) {
      const transitionWindow = {
        start: subMinutes(shiftStart, 15),
        end: shiftStart,
      };

      const isInTransitionWindow = isWithinInterval(now, transitionWindow);

      if (isInTransitionWindow) {
        return {
          from: {
            type: PeriodType.OVERTIME,
            end: overtimeInfo.endTime,
          },
          to: {
            type: PeriodType.REGULAR,
            start: periodState.shift.startTime,
          },
          isInTransition: true,
        };
      }
    }

    return undefined;
  }

  async enhanceAttendanceStatus(
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    now: Date,
  ): Promise<AttendanceStateResponse> {
    // Calculate current period state
    const currentState = this.periodManager.resolveCurrentPeriod(
      attendance,
      periodState,
      now,
    );

    // Calculate transitions
    const transitions = this.periodManager.calculatePeriodTransitions(
      currentState,
      periodState,
      now,
    );

    // Fix context building - don't include next period if already in overtime
    const isOvertimeActive = Boolean(
      attendance?.isOvertime || attendance?.type === PeriodType.OVERTIME,
    );

    console.log('Building context:', {
      currentTime: format(now, 'HH:mm'),
      isOvertimeActive,
      currentType: attendance?.type,
      transitions: transitions.length,
    });

    // Map ShiftWindowResponse to our context interfaces
    const context: ShiftContext & TransitionContext = {
      shift: periodState.shift,
      schedule: {
        isHoliday: periodState.isHoliday,
        isDayOff: periodState.isDayOff,
        isAdjusted: periodState.isAdjusted,
        holidayInfo: periodState.holidayInfo,
      },
      // Only include next period info if not already in overtime
      nextPeriod:
        !isOvertimeActive && transitions.length > 0
          ? {
              type: transitions[0].to.type,
              startTime: transitions[0].transitionTime,
              overtimeInfo: periodState.overtimeInfo,
            }
          : null,
      // Similarly, only include transition info if not already transitioned
      transition: !isOvertimeActive
        ? this.determineTransitionContext(
            now,
            periodState,
            periodState.overtimeInfo,
          )
        : undefined,
    };

    // Create state validation
    const stateValidation = this.createStateValidation(
      attendance,
      currentState,
      periodState,
      now,
    );

    return {
      daily: {
        date: format(now, 'yyyy-MM-dd'),
        currentState,
        transitions: isOvertimeActive ? [] : transitions, // Clear transitions if in overtime
      },
      base: {
        state: attendance?.state || AttendanceState.ABSENT,
        checkStatus: attendance?.checkStatus || CheckStatus.PENDING,
        isCheckingIn:
          !attendance?.CheckInTime || Boolean(attendance?.CheckOutTime),
        latestAttendance: attendance,
        periodInfo: {
          type: currentState.type,
          isOvertime: currentState.activity.isOvertime,
          overtimeState: attendance?.overtimeState,
        },
        validation: {
          canCheckIn:
            !currentState.activity.isActive && stateValidation.allowed,
          canCheckOut:
            currentState.activity.isActive && stateValidation.allowed,
          message: stateValidation.reason,
        },
        metadata: {
          lastUpdated: now.toISOString(),
          version: 1,
          source: attendance?.metadata?.source || 'system',
        },
      },
      context,
      validation: stateValidation,
    };
  }

  public createStateValidation(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): StateValidation {
    // First determine period status and timing
    const periodStatusInfo = this.determinePeriodStatusInfo(
      attendance,
      currentState,
      window,
      now,
    );

    // Then determine transition state
    const transitionStatus = this.determineTransitionStatusInfo(
      periodStatusInfo,
      window,
      now,
    );

    // Handle transition state
    if (transitionStatus.isInTransition) {
      return {
        allowed: true,
        reason: '',
        flags: this.getValidationFlags({
          ...periodStatusInfo,
          isPendingOvertime: true,
          hasPendingTransition: true,
          requiresTransition: true,
        }),
        metadata: {
          nextTransitionTime: format(
            transitionStatus.window.start,
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
          ),
          requiredAction: 'TRANSITION_REQUIRED',
          additionalInfo: {
            transitionType: transitionStatus.targetPeriod,
          },
        },
      };
    }

    // Handle overtime period
    if (periodStatusInfo.isOvertimePeriod) {
      return this.getOvertimeValidation(periodStatusInfo, window, now);
    }

    // Handle regular period
    return this.getRegularValidation(periodStatusInfo, window, attendance);
  }

  private determinePeriodStatusInfo(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): PeriodStatusInfo {
    const isActiveAttendance = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );

    const isOvertimePeriod = Boolean(
      attendance?.isOvertime || currentState.type === PeriodType.OVERTIME,
    );

    return {
      isActiveAttendance,
      isOvertimePeriod,
      timingFlags: attendance?.checkTiming || {
        isEarlyCheckIn: currentState.validation.isEarly,
        isLateCheckIn: currentState.validation.isLate,
        isLateCheckOut: false,
        isVeryLateCheckOut: false,
        lateCheckOutMinutes: 0,
      },
      shiftTiming: {
        isMorningShift: parseInt(window.shift.startTime.split(':')[0], 10) < 12,
        isAfternoonShift:
          parseInt(window.shift.startTime.split(':')[0], 10) >= 12,
        isAfterMidshift: this.isAfterMidshift(now, window),
      },
    };
  }

  private determineTransitionStatusInfo(
    periodStatusInfo: PeriodStatusInfo,
    window: ShiftWindowResponse,
    now: Date,
  ): TransitionStatusInfo {
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );

    const transitionWindow = {
      start: subMinutes(shiftEnd, 5),
      end: addMinutes(shiftEnd, 15),
    };

    const isInTransitionWindow = isWithinInterval(now, transitionWindow);
    const hasUpcomingOvertime = Boolean(
      window.overtimeInfo?.startTime === window.shift.endTime,
    );

    const isInTransition =
      isInTransitionWindow &&
      hasUpcomingOvertime &&
      periodStatusInfo.isActiveAttendance;

    return {
      isInTransition,
      window: transitionWindow,
      targetPeriod: PeriodType.OVERTIME,
    };
  }

  private getOvertimeValidation(
    periodStatusInfo: PeriodStatusInfo,
    window: ShiftWindowResponse,
    now: Date,
  ): StateValidation {
    const overtimeEnd = window.overtimeInfo?.endTime
      ? parseISO(`${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.endTime}`)
      : null;

    const overtimeStatus = this.determineOvertimeCheckoutStatus(
      now,
      window.overtimeInfo!.endTime,
      periodStatusInfo.isActiveAttendance,
    );

    return {
      allowed: overtimeStatus.allowManualCheckout,
      reason: overtimeStatus.reason,
      flags: {
        hasActivePeriod: periodStatusInfo.isActiveAttendance,
        isInsideShift: window.overtimeInfo?.isInsideShiftHours || false,
        isOutsideShift: false,
        isCheckingIn: !periodStatusInfo.isActiveAttendance,
        isEarlyCheckIn: periodStatusInfo.timingFlags.isEarlyCheckIn,
        isLateCheckIn: periodStatusInfo.timingFlags.isLateCheckIn,
        isEarlyCheckOut: false,
        isLateCheckOut: periodStatusInfo.timingFlags.isLateCheckOut,
        isVeryLateCheckOut: periodStatusInfo.timingFlags.isVeryLateCheckOut,
        isOvertime: true,
        isDayOffOvertime: window.overtimeInfo?.isDayOffOvertime || false,
        isPendingOvertime: false,
        isAutoCheckIn: false,
        isAutoCheckOut: overtimeStatus.shouldAutoComplete,
        requireConfirmation: overtimeStatus.shouldAutoComplete,
        requiresAutoCompletion: overtimeStatus.shouldAutoComplete,
        hasPendingTransition: false,
        requiresTransition: false,
        isMorningShift: periodStatusInfo.shiftTiming.isMorningShift,
        isAfternoonShift: periodStatusInfo.shiftTiming.isAfternoonShift,
        isAfterMidshift: periodStatusInfo.shiftTiming.isAfterMidshift,
        isApprovedEarlyCheckout: false,
        isPlannedHalfDayLeave: false,
        isEmergencyLeave: false,
        isHoliday: window.isHoliday,
        isDayOff: Boolean(window.isDayOff),
        isManualEntry: false,
      },
      metadata: overtimeStatus.shouldAutoComplete
        ? {
            nextTransitionTime: overtimeStatus.checkoutTime?.toISOString(),
            requiredAction: 'AUTO_COMPLETE_OVERTIME',
            additionalInfo: {
              autoCompleteTime: overtimeStatus.checkoutTime
                ? format(overtimeStatus.checkoutTime, 'HH:mm:ss')
                : undefined,
              overtimeInfo: window.overtimeInfo,
            },
          }
        : {
            additionalInfo: {
              overtimeInfo: window.overtimeInfo,
            },
          },
    };
  }

  private getRegularValidation(
    periodStatusInfo: PeriodStatusInfo,
    window: ShiftWindowResponse,
    attendance: AttendanceRecord | null,
  ): StateValidation {
    const shiftEnd = parseISO(
      `${format(getCurrentTime(), 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const midShiftTime = this.calculateMidShift(
      parseISO(
        `${format(getCurrentTime(), 'yyyy-MM-dd')}T${window.shift.startTime}`,
      ),
      shiftEnd,
    );

    const isVeryEarlyCheckout =
      periodStatusInfo.isActiveAttendance &&
      !periodStatusInfo.shiftTiming.isAfterMidshift;

    // Handle emergency leave case
    if (isVeryEarlyCheckout) {
      return {
        allowed: true,
        reason: 'หากต้องการออกงานฉุกเฉิน ระบบจะขออนุมัติลาป่วยให้',
        flags: {
          hasActivePeriod: true,
          isInsideShift: true,
          isOutsideShift: false,
          isCheckingIn: !periodStatusInfo.isActiveAttendance,
          isEarlyCheckIn: periodStatusInfo.timingFlags.isEarlyCheckIn,
          isLateCheckIn: periodStatusInfo.timingFlags.isLateCheckIn,
          isEarlyCheckOut: false,
          isLateCheckOut: false,
          isVeryLateCheckOut: false,
          isOvertime: false,
          isDayOffOvertime: false,
          isPendingOvertime: false,
          isAutoCheckIn: false,
          isAutoCheckOut: false,
          requireConfirmation: false,
          requiresAutoCompletion: false,
          hasPendingTransition: false,
          requiresTransition: false,
          isMorningShift: periodStatusInfo.shiftTiming.isMorningShift,
          isAfternoonShift: periodStatusInfo.shiftTiming.isAfternoonShift,
          isAfterMidshift: periodStatusInfo.shiftTiming.isAfterMidshift,
          isApprovedEarlyCheckout: false,
          isPlannedHalfDayLeave: false,
          isEmergencyLeave: true,
          isHoliday: window.isHoliday,
          isDayOff: Boolean(window.isDayOff),
          isManualEntry: attendance?.metadata?.source === 'manual',
        },
        metadata: {
          additionalInfo: {},
        },
      };
    }

    // Normal regular period validation
    const canCheckIn =
      !periodStatusInfo.isOvertimePeriod &&
      (!periodStatusInfo.isActiveAttendance ||
        periodStatusInfo.timingFlags.isEarlyCheckIn);

    const canCheckOut =
      periodStatusInfo.isActiveAttendance &&
      periodStatusInfo.shiftTiming.isAfterMidshift;

    const hasPendingTransition =
      window.nextPeriod?.type === PeriodType.OVERTIME;

    return {
      allowed: canCheckIn || canCheckOut,
      reason: this.getValidationReason({
        periodStatusInfo,
        window,
        attendance,
      }),
      flags: {
        hasActivePeriod: periodStatusInfo.isActiveAttendance,
        isInsideShift: true,
        isOutsideShift: false,
        isCheckingIn: !periodStatusInfo.isActiveAttendance,
        isEarlyCheckIn: periodStatusInfo.timingFlags.isEarlyCheckIn,
        isLateCheckIn: periodStatusInfo.timingFlags.isLateCheckIn,
        isEarlyCheckOut: false,
        isLateCheckOut: periodStatusInfo.timingFlags.isLateCheckOut,
        isVeryLateCheckOut: periodStatusInfo.timingFlags.isVeryLateCheckOut,
        isOvertime: false,
        isDayOffOvertime: false,
        isPendingOvertime: false,
        isAutoCheckIn: false,
        isAutoCheckOut: false,
        requireConfirmation: false,
        requiresAutoCompletion: false,
        hasPendingTransition,
        requiresTransition: false,
        isMorningShift: periodStatusInfo.shiftTiming.isMorningShift,
        isAfternoonShift: periodStatusInfo.shiftTiming.isAfternoonShift,
        isAfterMidshift: periodStatusInfo.shiftTiming.isAfterMidshift,
        isApprovedEarlyCheckout: false,
        isPlannedHalfDayLeave: false,
        isEmergencyLeave: false,
        isHoliday: window.isHoliday,
        isDayOff: Boolean(window.isDayOff),
        isManualEntry: attendance?.metadata?.source === 'manual',
      },
      metadata: {
        additionalInfo: {},
      },
    };
  }

  private isAfterMidshift(now: Date, window: ShiftWindowResponse): boolean {
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const midShiftTime = this.calculateMidShift(shiftStart, shiftEnd);
    return now >= midShiftTime;
  }

  private determineOvertimeCheckoutStatus(
    now: Date,
    overtimeEnd: string,
    isActiveAttendance: boolean,
  ): OvertimeCheckoutStatus {
    try {
      const endTime = parseISO(`${format(now, 'yyyy-MM-dd')}T${overtimeEnd}`);
      const lateThresholdEnd = addMinutes(
        endTime,
        VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT,
      );

      // If not after end time, normal checkout
      if (now <= endTime) {
        return {
          shouldAutoComplete: false,
          allowManualCheckout: true,
          checkoutTime: null,
          reason: '',
        };
      }

      // If within late threshold
      if (now <= lateThresholdEnd) {
        return {
          shouldAutoComplete: false,
          allowManualCheckout: true,
          checkoutTime: null,
          reason: 'ลงเวลาออก OT ก่อนเวลาเลย 15 นาที',
        };
      }

      // Past late threshold - should auto complete at exact overtime end
      return {
        shouldAutoComplete: true,
        allowManualCheckout: false,
        checkoutTime: endTime,
        reason: 'เลยเวลาลงเวลาออก OT แล้ว ระบบจะทำการลงเวลาให้โดยอัตโนมัติ',
      };
    } catch (error) {
      console.error('Error determining overtime checkout status:', error);
      return {
        shouldAutoComplete: false,
        allowManualCheckout: false,
        checkoutTime: null,
        reason: 'Error processing overtime checkout',
      };
    }
  }

  private getRequiredAction(
    state: UnifiedPeriodState,
    window: ShiftWindowResponse,
    attendance: AttendanceRecord | null,
  ): string | undefined {
    if (window.transition?.isInTransition) {
      return 'Transition to next period required';
    }

    // Add check for upcoming overtime transition
    if (
      state.activity.isActive &&
      window.nextPeriod?.type === PeriodType.OVERTIME &&
      isWithinInterval(getCurrentTime(), {
        start: subMinutes(parseISO(window.current.end), 15),
        end: parseISO(window.current.end),
      })
    ) {
      return 'Overtime period starting soon';
    }

    if (attendance?.overtimeEntries.some((entry) => !entry.actualEndTime)) {
      return 'Overtime completion required';
    }

    if (state.activity.isActive && !state.validation.isWithinBounds) {
      return 'Check-out required';
    }

    return undefined;
  }

  private checkIfEarlyCheckout(
    window: ShiftWindowResponse,
    now: Date,
  ): boolean {
    try {
      // First determine if we're in overtime period
      const isInOvertimePeriod =
        window.overtimeInfo &&
        isWithinInterval(now, {
          start: parseISO(
            `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
          ),
          end: parseISO(
            `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.endTime}`,
          ),
        });

      // Choose appropriate end time based on period
      const endTime = isInOvertimePeriod
        ? parseISO(
            `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo!.endTime}`,
          )
        : parseISO(`${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`);

      const earlyCheckoutTime = subMinutes(
        endTime,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
      );

      console.log('Early checkout check:', {
        currentTime: format(now, 'HH:mm'),
        isOvertime: isInOvertimePeriod,
        shiftEnd: format(endTime, 'HH:mm'),
        earlyCheckoutThreshold: format(earlyCheckoutTime, 'HH:mm'),
        isEarly: isBefore(now, earlyCheckoutTime),
      });

      return isBefore(now, earlyCheckoutTime);
    } catch (error) {
      console.error('Error checking early checkout:', error);
      return false;
    }
  }

  private getValidationFlags(
    info: PeriodStatusInfo & {
      isPendingOvertime?: boolean;
      hasPendingTransition?: boolean;
      requiresTransition?: boolean;
      requiresAutoComplete?: boolean;
    },
  ): ValidationFlags {
    return {
      hasActivePeriod: info.isActiveAttendance,
      isInsideShift: true,
      isOutsideShift: false,
      isCheckingIn: !info.isActiveAttendance,
      isEarlyCheckIn: info.timingFlags.isEarlyCheckIn,
      isLateCheckIn: info.timingFlags.isLateCheckIn,
      isEarlyCheckOut: false,
      isLateCheckOut: info.timingFlags.isLateCheckOut,
      isVeryLateCheckOut: info.timingFlags.isVeryLateCheckOut,
      isOvertime: info.isOvertimePeriod,
      isDayOffOvertime: false,
      isPendingOvertime: info.isPendingOvertime || false,
      isAutoCheckIn: false,
      isAutoCheckOut: false,
      requireConfirmation:
        info.requiresAutoComplete || info.hasPendingTransition || false,
      requiresAutoCompletion: info.requiresAutoComplete || false,
      hasPendingTransition: info.hasPendingTransition || false,
      requiresTransition: info.requiresTransition || false,
      isMorningShift: info.shiftTiming.isMorningShift,
      isAfternoonShift: info.shiftTiming.isAfternoonShift,
      isAfterMidshift: info.shiftTiming.isAfterMidshift,
      isApprovedEarlyCheckout: false,
      isPlannedHalfDayLeave: false,
      isEmergencyLeave: false,
      isHoliday: false,
      isDayOff: false,
      isManualEntry: false,
    };
  }

  // getValidationReason needs to be updated to handle new format:
  private getValidationReason(params: {
    periodStatusInfo: PeriodStatusInfo;
    window: ShiftWindowResponse;
    attendance: AttendanceRecord | null;
  }): string {
    const { periodStatusInfo, window, attendance } = params;

    if (attendance?.checkTiming?.isEarlyCheckIn) {
      return 'Too early to check in';
    }
    if (attendance?.checkTiming?.isLateCheckIn) {
      return 'Late check-in';
    }
    if (
      window.nextPeriod?.type === PeriodType.OVERTIME &&
      periodStatusInfo.isActiveAttendance
    ) {
      return 'Please check out and transition to overtime period';
    }
    if (attendance?.checkTiming?.isLateCheckOut) {
      return `Late check-out (${attendance.checkTiming.lateCheckOutMinutes} minutes)`;
    }
    if (window.transition?.isInTransition) {
      return 'Pending period transition';
    }
    if (attendance?.metadata?.isDayOff || window.isDayOff) {
      return 'Day off';
    }
    if (window.isHoliday) {
      return 'Holiday';
    }
    return '';
  }

  // 3. Add helper functions for state validation
  private calculateMidShift(start: Date, end: Date): Date {
    const diffInMinutes = differenceInMinutes(end, start);
    return addMinutes(start, Math.floor(diffInMinutes / 2));
  }
}

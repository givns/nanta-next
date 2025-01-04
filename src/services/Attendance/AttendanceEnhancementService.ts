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

    // Map ShiftWindowResponse to our context interfaces
    const context: ShiftContext & TransitionContext = {
      shift: periodState.shift,
      schedule: {
        isHoliday: periodState.isHoliday,
        isDayOff: periodState.isDayOff,
        isAdjusted: periodState.isAdjusted,
        holidayInfo: periodState.holidayInfo,
      },
      nextPeriod:
        transitions.length > 0
          ? {
              type: transitions[0].to.type,
              startTime: transitions[0].transitionTime,
              overtimeInfo: periodState.overtimeInfo,
            }
          : null,
      transition: this.determineTransitionContext(
        now,
        periodState,
        periodState.overtimeInfo,
      ),
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
        transitions,
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
    // Core attendance state
    const isActiveAttendance = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );

    // Get timing flags from attendance record
    const timingFlags = attendance?.checkTiming || {
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      isVeryLateCheckOut: false,
      lateCheckOutMinutes: 0,
    };

    // Shift timing calculations - Use shift end time instead of window end
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const shiftStartHour = parseInt(window.shift.startTime.split(':')[0], 10);
    const isMorningShift = shiftStartHour >= 4 && shiftStartHour < 12;
    const isAfternoonShift = !isMorningShift;

    // Enhanced overtime detection
    const hasApprovedOvertime = Boolean(
      window.overtimeInfo || window.nextPeriod?.type === PeriodType.OVERTIME,
    );
    const overtimeStart =
      window.overtimeInfo?.startTime || window.nextPeriod?.startTime;

    // Calculate checkout validation windows
    const midShiftTime = this.calculateMidShift(
      parseISO(`${format(now, 'yyyy-MM-dd')}T${window.shift.startTime}`),
      shiftEnd,
    );
    const isAfterMidshift = now > midShiftTime;
    const isVeryEarlyCheckout = isActiveAttendance && !isAfterMidshift;
    const isEarlyCheckout =
      isActiveAttendance && this.checkIfEarlyCheckout(window, now);

    // Calculate transition window
    const transitionWindow = {
      start: subMinutes(shiftEnd, 5),
      end: addMinutes(shiftEnd, 15),
    };

    // Debug time calculations
    console.log('Time calculations:', {
      now: format(now, 'HH:mm'),
      shiftEnd: format(shiftEnd, 'HH:mm'),
      transitionStart: format(transitionWindow.start, 'HH:mm'),
      transitionEnd: format(transitionWindow.end, 'HH:mm'),
      hasUpcomingOvertime: Boolean(window.overtimeInfo),
    });

    const isInTransitionWindow = isWithinInterval(now, transitionWindow);
    const hasUpcomingOvertime = Boolean(
      overtimeStart === window.shift.endTime ||
        window.overtimeInfo?.startTime === window.shift.endTime,
    );

    const hasPendingTransition = isInTransitionWindow && hasUpcomingOvertime;
    const requiresTransition = hasPendingTransition && isActiveAttendance;

    // Overtime status
    const isOvertime =
      attendance?.isOvertime || currentState.activity.isOvertime;
    const isDayOffOvertime = Boolean(
      currentState.activity.isDayOffOvertime ||
        window.overtimeInfo?.isDayOffOvertime ||
        (attendance?.isOvertime && attendance?.metadata?.isDayOff),
    );

    console.log('Overtime validation:', {
      now: format(now, 'HH:mm'),
      shiftEnd: format(shiftEnd, 'HH:mm'),
      hasApprovedOvertime,
      overtimeStart,
      isInTransitionWindow,
      hasPendingTransition,
    });

    // Debug logging
    console.log('Validation state:', {
      timing: {
        now: format(now, 'HH:mm'),
        midshift: format(midShiftTime, 'HH:mm'),
        shiftEnd: format(shiftEnd, 'HH:mm'),
      },
      checkouts: {
        isVeryEarly: isVeryEarlyCheckout,
        isEarly: isEarlyCheckout,
        isAfterMidshift,
      },
      transitions: {
        isInWindow: isInTransitionWindow,
        hasOvertime: hasUpcomingOvertime,
        requiresTransition,
      },
    });

    // Build validation flags
    const flags = {
      // Core Status
      hasActivePeriod: isActiveAttendance,
      isInsideShift: currentState.validation.isWithinBounds,
      isOutsideShift:
        isActiveAttendance && !currentState.validation.isWithinBounds,

      // Check-in/out Status
      isEarlyCheckIn: timingFlags.isEarlyCheckIn,
      isLateCheckIn: timingFlags.isLateCheckIn,
      isEarlyCheckOut: isEarlyCheckout,
      isLateCheckOut: timingFlags.isLateCheckOut,
      isVeryLateCheckOut: timingFlags.isVeryLateCheckOut,

      // Overtime
      isOvertime,
      isPendingOvertime: hasUpcomingOvertime,
      isDayOffOvertime,

      // Auto-completion
      isAutoCheckIn: attendance?.metadata?.source === 'auto',
      isAutoCheckOut: attendance?.metadata?.source === 'auto',
      requiresAutoCompletion: isActiveAttendance && isVeryEarlyCheckout,
      isEmergencyLeave: isVeryEarlyCheckout,

      // Transition
      hasPendingTransition,
      requiresTransition,

      // Schedule
      isAfternoonShift,
      isMorningShift,
      isAfterMidshift,

      // Special Cases
      isApprovedEarlyCheckout: false,
      isPlannedHalfDayLeave: false,
      isHoliday: window.isHoliday,
      isDayOff: Boolean(window.isDayOff || attendance?.metadata?.isDayOff),
      isManualEntry: attendance?.metadata?.source === 'manual',
    };

    // Handle emergency leave case
    if (isActiveAttendance && isVeryEarlyCheckout && !isEarlyCheckout) {
      return {
        allowed: true,
        reason: 'หากต้องการออกงานฉุกเฉิน ระบบจะขออนุมัติลาป่วยให้',
        flags,
      };
    }

    // Handle early checkout case
    if (isActiveAttendance && isEarlyCheckout && !isVeryEarlyCheckout) {
      const shiftEnd = parseISO(window.current.end);
      const minutesUntilEnd = differenceInMinutes(shiftEnd, now);

      return {
        allowed: false,
        reason: `ยังเหลือเวลางานอีก ${minutesUntilEnd} นาที กรุณาลงเวลาออกตอน ${format(
          subMinutes(shiftEnd, ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD),
          'HH:mm',
        )}`,
        flags,
      };
    }

    // Handle approaching overtime transition
    if (isActiveAttendance && hasPendingTransition) {
      return {
        allowed: true,
        reason: ``,
        flags: {
          ...flags,
          isPendingOvertime: true,
          hasPendingTransition: true,
          requiresTransition: true,
        },
        metadata: {
          nextTransitionTime: shiftEnd.toISOString(),
          requiredAction: 'Overtime Available',
          additionalInfo: {
            overtimeInfo: window.overtimeInfo,
            transitionWindow: {
              start: format(transitionWindow.start, 'HH:mm'),
              end: format(transitionWindow.end, 'HH:mm'),
              type: 'OVERTIME',
            },
            displayOptions: {
              showSplitButton: true,
              overtimeDuration: window.overtimeInfo?.durationMinutes || 0,
            },
          },
        },
      };
    }
    // Handle normal validation
    return {
      allowed: currentState.validation.isWithinBounds,
      reason: this.getValidationReason(currentState, window, attendance),
      flags,
      ...(hasPendingTransition && {
        metadata: {
          nextTransitionTime: shiftEnd.toISOString(),
          requiredAction: this.getRequiredAction(
            currentState,
            window,
            attendance,
          ),
          additionalInfo: {
            ...this.buildAdditionalInfo(attendance, window),
            transitionWindow: {
              start: format(transitionWindow.start, 'HH:mm'),
              end: format(transitionWindow.end, 'HH:mm'),
              type: 'OVERTIME',
            },
          },
        },
      }),
    };
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

  private checkIfRequiresAutoCompletion(
    attendance: AttendanceRecord | null,
    window: ShiftWindowResponse,
  ): boolean {
    if (!attendance) return false;

    // Check for incomplete regular period
    if (attendance.CheckInTime && !attendance.CheckOutTime) {
      return true;
    }

    // Check for incomplete overtime entries
    return attendance.overtimeEntries.some(
      (entry) => !entry.actualStartTime || !entry.actualEndTime,
    );
  }

  private getValidationReason(
    state: UnifiedPeriodState,
    window: ShiftWindowResponse,
    attendance: AttendanceRecord | null,
  ): string {
    if (attendance?.checkTiming?.isEarlyCheckIn) {
      return 'Too early to check in';
    }
    if (attendance?.checkTiming?.isLateCheckIn) {
      return 'Late check-in';
    }
    if (
      window.nextPeriod?.type === PeriodType.OVERTIME &&
      state.activity.isActive
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

  private buildAdditionalInfo(
    attendance: AttendanceRecord | null,
    window: ShiftWindowResponse,
  ): Record<string, unknown> {
    const additionalInfo: Record<string, unknown> = {
      overtimeInfo: window.overtimeInfo,
      holidayInfo: window.holidayInfo,
      timeEntries: attendance?.timeEntries?.length ?? 0,
      overtimeEntries: attendance?.overtimeEntries?.length ?? 0,
    };

    if (attendance?.checkTiming) {
      additionalInfo.checkTiming = {
        lateCheckOutMinutes: attendance.checkTiming.lateCheckOutMinutes,
      };
    }

    if (attendance?.location) {
      additionalInfo.location = {
        checkIn: attendance.location.checkIn,
        checkOut: attendance.location.checkOut,
      };
    }

    if (attendance?.metadata) {
      additionalInfo.recordMetadata = {
        createdAt: attendance.metadata.createdAt,
        updatedAt: attendance.metadata.updatedAt,
        source: attendance.metadata.source,
      };
    }

    return additionalInfo;
  }

  // 3. Add helper functions for state validation
  private calculateMidShift(start: Date, end: Date): Date {
    const diffInMinutes = differenceInMinutes(end, start);
    return addMinutes(start, Math.floor(diffInMinutes / 2));
  }
}

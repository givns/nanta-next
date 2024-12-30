import {
  AttendanceRecord,
  ShiftWindowResponse,
  AttendanceStateResponse,
  UnifiedPeriodState,
  StateValidation,
  ShiftContext,
  TransitionContext,
  ATTENDANCE_CONSTANTS,
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

    // Create state validation
    const stateValidation = this.createStateValidation(
      attendance,
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
      nextPeriod: periodState.nextPeriod,
      transition: periodState.transition,
    };

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

    // Shift timing calculations
    const shiftEnd = parseISO(window.current.end);
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
      parseISO(window.current.start),
      parseISO(window.current.end),
    );
    const isAfterMidshift = now > midShiftTime;
    const isVeryEarlyCheckout = isActiveAttendance && !isAfterMidshift;
    const isEarlyCheckout =
      isActiveAttendance && this.checkIfEarlyCheckout(window, now);

    // Calculate transition window
    const transitionWindow = {
      start: subMinutes(shiftEnd, 15), // Start showing transition 15 min before shift end
      end: shiftEnd,
    };

    const isInTransitionWindow = isWithinInterval(now, transitionWindow);
    const hasUpcomingOvertime = Boolean(
      overtimeStart === window.shift.endTime || // Overtime starts at shift end
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
    if (isActiveAttendance && isVeryEarlyCheckout) {
      return {
        allowed: true,
        reason: 'Early checkout will be recorded as sick leave',
        flags,
      };
    }

    // Handle early checkout case
    if (isActiveAttendance && isEarlyCheckout && !isVeryEarlyCheckout) {
      const minutesUntilEnd = differenceInMinutes(shiftEnd, now);

      // Allow early checkout if approaching overtime
      if (hasPendingTransition) {
        return {
          allowed: true,
          reason: 'Overtime period starting soon. Would you like to continue?',
          flags: {
            ...flags,
            isPendingOvertime: true,
            hasPendingTransition: true,
            requiresTransition: true,
          },
          metadata: {
            nextTransitionTime: shiftEnd.toISOString(),
            requiredAction: 'Overtime transition available',
            additionalInfo: {
              overtimeInfo: window.overtimeInfo,
              transitionWindow: {
                start: format(transitionWindow.start, 'HH:mm'),
                end: format(transitionWindow.end, 'HH:mm'),
                type: 'OVERTIME',
              },
            },
          },
        };
      }

      return {
        allowed: false,
        reason: `ยังเหลือเวลางานอีก ${minutesUntilEnd} นาที กรุณาลงเวลาออกตอน ${format(subMinutes(shiftEnd, ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD), 'HH:mm')}`,
        flags,
      };
    }

    // Handle approaching overtime transition
    if (isActiveAttendance && hasPendingTransition) {
      return {
        allowed: true,
        reason: 'Overtime period starting at 17:00. Do you want to continue?',
        flags: {
          ...flags,
          isPendingOvertime: true,
          hasPendingTransition: true,
          requiresTransition: true,
        },
        metadata: {
          nextTransitionTime: shiftEnd.toISOString(),
          requiredAction: 'Overtime transition available',
          additionalInfo: {
            overtimeInfo: window.overtimeInfo,
            transitionWindow: {
              start: format(transitionWindow.start, 'HH:mm'),
              end: format(transitionWindow.end, 'HH:mm'),
              type: 'OVERTIME',
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
    const endTime = parseISO(window.current.end);
    const earlyCheckoutTime = subMinutes(
      endTime,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
    );

    console.log('Early checkout check:', {
      currentTime: format(now, 'HH:mm'),
      shiftEnd: format(endTime, 'HH:mm'),
      earlyCheckoutThreshold: format(earlyCheckoutTime, 'HH:mm'),
      isEarly: isBefore(now, earlyCheckoutTime),
    });

    return isBefore(now, earlyCheckoutTime);
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

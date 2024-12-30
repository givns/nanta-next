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
    const isActiveAttendance = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );

    // Determine shift type based on start time
    const shiftStartHour = parseInt(window.shift.startTime.split(':')[0], 10);
    const isMorningShift = shiftStartHour >= 4 && shiftStartHour < 12;
    const isAfternoonShift = !isMorningShift;

    // Calculate midshift and early checkout status
    const midShiftTime = this.calculateMidShift(
      parseISO(window.current.start),
      parseISO(window.current.end),
    );
    const isAfterMidshift = now > midShiftTime;
    const isVeryEarlyCheckout = isActiveAttendance && !isAfterMidshift;
    const isEarlyCheckout =
      isActiveAttendance && this.checkIfEarlyCheckout(window, now);

    console.log('Validation Calculations:', {
      now: format(now, 'HH:mm'),
      midshift: format(midShiftTime, 'HH:mm'),
      checkIn: attendance?.CheckInTime
        ? format(new Date(attendance.CheckInTime), 'HH:mm')
        : null,
      shiftTimes: {
        start: window.shift.startTime,
        end: window.shift.endTime,
      },
    });

    console.log('Flag Calculations:', {
      isActiveAttendance,
      isAfterMidshift,
      isVeryEarlyCheckout,
    });

    // Get timing flags from attendance record
    const timingFlags = attendance?.checkTiming || {
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      isVeryLateCheckOut: false,
      lateCheckOutMinutes: 0,
    };

    // Handle overtime scenarios
    const isOvertime =
      attendance?.isOvertime || currentState.activity.isOvertime;
    const isPendingOvertime = Boolean(
      window.nextPeriod?.type === PeriodType.OVERTIME ||
        attendance?.overtimeEntries?.some((entry) => !entry.actualStartTime),
    );
    const isDayOffOvertime = Boolean(
      currentState.activity.isDayOffOvertime ||
        window.overtimeInfo?.isDayOffOvertime ||
        (attendance?.isOvertime && attendance?.metadata?.isDayOff),
    );

    // Handle pending transitions
    const shiftEnd = parseISO(window.current.end);
    const transitionWindow = {
      start: subMinutes(shiftEnd, 15),
      end: addMinutes(shiftEnd, 15),
    };

    // Check for pending transition
    const isInTransitionWindow = isWithinInterval(now, transitionWindow);
    const hasUpcomingOvertime = Boolean(
      window.nextPeriod?.type === PeriodType.OVERTIME,
    );
    const hasPendingTransition = isInTransitionWindow && hasUpcomingOvertime;

    // Requires transition if checked in and in transition window
    const requiresTransition =
      hasPendingTransition && currentState.activity.isActive;

    // Emergency leave or early checkout validation
    const requiresAutoCompletion =
      isActiveAttendance &&
      (isVeryEarlyCheckout ||
        this.checkIfRequiresAutoCompletion(attendance, window));

    const validation: StateValidation = {
      allowed: currentState.validation.isWithinBounds,
      reason: this.getValidationReason(currentState, window, attendance),
      flags: {
        // Core Status Flags
        hasActivePeriod: isActiveAttendance,
        isInsideShift: currentState.validation.isWithinBounds,
        isOutsideShift:
          isActiveAttendance && !currentState.validation.isWithinBounds,

        // Check-in Related
        isEarlyCheckIn: timingFlags.isEarlyCheckIn,
        isLateCheckIn: timingFlags.isLateCheckIn,

        // Check-out Related
        isEarlyCheckOut: isEarlyCheckout,
        isLateCheckOut: timingFlags.isLateCheckOut,
        isVeryLateCheckOut: timingFlags.isVeryLateCheckOut,

        // Overtime Related
        isOvertime,
        isPendingOvertime: hasUpcomingOvertime,
        isDayOffOvertime,

        // Auto-completion & Emergency Leave
        isAutoCheckIn: attendance?.metadata?.source === 'auto',
        isAutoCheckOut: attendance?.metadata?.source === 'auto',
        requiresAutoCompletion,
        isEmergencyLeave: isVeryEarlyCheckout,

        // Transition
        hasPendingTransition,
        requiresTransition,

        // Schedule Related
        isAfternoonShift,
        isMorningShift,
        isAfterMidshift,

        // Special Cases
        isApprovedEarlyCheckout: false,
        isPlannedHalfDayLeave: false,
        isHoliday: window.isHoliday,
        isDayOff: Boolean(window.isDayOff || attendance?.metadata?.isDayOff),
        isManualEntry: attendance?.metadata?.source === 'manual',
      },
    };

    // Enhanced metadata handling
    const nextTransitionTime =
      window.transition?.to.start ||
      (hasUpcomingOvertime ? shiftEnd.toISOString() : undefined);

    if (
      nextTransitionTime ||
      this.getRequiredAction(currentState, window, attendance)
    ) {
      validation.metadata = {
        nextTransitionTime,
        requiredAction: this.getRequiredAction(
          currentState,
          window,
          attendance,
        ),
        additionalInfo: {
          ...this.buildAdditionalInfo(attendance, window),
          // Add transition window info if relevant
          ...(hasPendingTransition && {
            transitionWindow: {
              start: format(transitionWindow.start, 'HH:mm'),
              end: format(transitionWindow.end, 'HH:mm'),
              type: 'OVERTIME',
            },
          }),
        },
      };
    }

    return validation;
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
    return isBefore(
      now,
      subMinutes(endTime, ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD),
    );
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

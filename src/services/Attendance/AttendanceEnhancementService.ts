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
  parseISO,
  subMinutes,
} from 'date-fns';
import { PeriodManagementService } from './PeriodManagementService';

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

    // Check if after midshift
    const midShiftTime = this.calculateMidShift(
      parseISO(window.current.start),
      parseISO(window.current.end),
    );
    const isAfterMidshift = now > midShiftTime;

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
    const hasPendingTransition = Boolean(window.transition?.isInTransition);
    const requiresTransition =
      hasPendingTransition && currentState.activity.isActive;

    // Handle auto-completion requirements
    const requiresAutoCompletion = this.checkIfRequiresAutoCompletion(
      attendance,
      window,
    );

    // Rather than relying on metadata for these flags, we'll use other data points
    const isApprovedEarlyCheckout = false; // This should come from a leave/permission system
    const isPlannedHalfDayLeave = false; // This should come from a leave system
    const isEmergencyLeave = false; // This should come from a leave system

    const validation: StateValidation = {
      allowed: currentState.validation.isWithinBounds,
      reason: this.getValidationReason(currentState, window, attendance),
      flags: {
        // Core Status Flags
        hasActivePeriod: isActiveAttendance,
        isInsideShift: currentState.validation.isWithinBounds,
        isOutsideShift:
          isActiveAttendance && !currentState.validation.isWithinBounds,

        // Check-in Related - Use attendance.checkTiming
        isEarlyCheckIn: timingFlags.isEarlyCheckIn,
        isLateCheckIn: timingFlags.isLateCheckIn,

        // Check-out Related - Use attendance.checkTiming
        isEarlyCheckOut: this.checkIfEarlyCheckout(attendance, window),
        isLateCheckOut: timingFlags.isLateCheckOut,
        isVeryLateCheckOut: timingFlags.isVeryLateCheckOut,

        // Overtime Related
        isOvertime,
        isPendingOvertime,
        isDayOffOvertime,

        // Auto-completion
        isAutoCheckIn: attendance?.metadata?.source === 'auto',
        isAutoCheckOut: attendance?.metadata?.source === 'auto',
        requiresAutoCompletion,

        // Transition
        hasPendingTransition,
        requiresTransition,

        // Schedule Related
        isAfternoonShift,
        isMorningShift,
        isAfterMidshift,

        // Special Cases
        isApprovedEarlyCheckout,
        isPlannedHalfDayLeave,
        isEmergencyLeave,
        isHoliday: window.isHoliday,
        isDayOff: Boolean(window.isDayOff || attendance?.metadata?.isDayOff),
        isManualEntry: attendance?.metadata?.source === 'manual',
      },
    };
    // Add metadata if we have values
    const additionalInfo: Record<string, unknown> = {
      overtimeInfo: window.overtimeInfo,
      holidayInfo: window.holidayInfo,
      checkTiming: attendance?.checkTiming
        ? {
            lateCheckOutMinutes: attendance.checkTiming.lateCheckOutMinutes,
          }
        : undefined,
      timeEntries: attendance?.timeEntries?.length ?? 0,
      overtimeEntries: attendance?.overtimeEntries?.length ?? 0,
    };

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

    // Only add metadata field if we have values to add
    if (
      window.transition?.to.start ||
      this.getRequiredAction(currentState, window, attendance)
    ) {
      validation.metadata = {
        nextTransitionTime: window.transition?.to.start || undefined,
        requiredAction: this.getRequiredAction(
          currentState,
          window,
          attendance,
        ),
        additionalInfo,
      };
    }
    return validation;
  }

  private checkIfEarlyCheckout(
    attendance: AttendanceRecord | null,
    window: ShiftWindowResponse,
  ): boolean {
    if (!attendance?.CheckOutTime || !attendance.shiftEndTime) {
      return false;
    }

    const endTime = parseISO(window.current.end);
    return isBefore(
      attendance.CheckOutTime,
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

  private getRequiredAction(
    state: UnifiedPeriodState,
    window: ShiftWindowResponse,
    attendance: AttendanceRecord | null,
  ): string | undefined {
    if (window.transition?.isInTransition) {
      return 'Transition to next period required';
    }
    if (attendance?.overtimeEntries.some((entry) => !entry.actualEndTime)) {
      return 'Overtime completion required';
    }
    if (state.activity.isActive && !state.validation.isWithinBounds) {
      return 'Check-out required';
    }
    return undefined;
  }

  // 3. Add helper functions for state validation
  private calculateMidShift(start: Date, end: Date): Date {
    const diffInMinutes = differenceInMinutes(end, start);
    return addMinutes(start, Math.floor(diffInMinutes / 2));
  }
}

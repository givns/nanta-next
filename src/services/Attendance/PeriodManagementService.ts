import {
  PeriodTransition,
  ShiftWindowResponse,
  UnifiedPeriodState,
  AttendanceRecord,
} from '@/types/attendance';
import { ATTENDANCE_CONSTANTS } from '@/types/attendance/base';
import { PeriodType } from '@prisma/client';
import {
  parseISO,
  format,
  isWithinInterval,
  subMinutes,
  addMinutes,
} from 'date-fns';

export class PeriodManagementService {
  resolveCurrentPeriod(
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    now: Date,
  ): UnifiedPeriodState {
    // Parse all relevant times
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
    );

    // Check for transition conditions
    const transitionWindow = {
      start: subMinutes(shiftEnd, 15),
      end: shiftEnd,
    };

    const hasUpcomingOvertime = Boolean(
      periodState.overtimeInfo?.startTime === periodState.shift.endTime,
    );
    const isInTransitionWindow = isWithinInterval(now, transitionWindow);

    // Core status checks
    const isCheckedIn = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );
    const isInShiftTime = isWithinInterval(now, {
      start: shiftStart,
      end: shiftEnd,
    });

    console.log('Period resolution:', {
      currentTime: format(now, 'HH:mm'),
      shift: {
        start: format(shiftStart, 'HH:mm'),
        end: format(shiftEnd, 'HH:mm'),
      },
      transition: {
        window: {
          start: format(transitionWindow.start, 'HH:mm'),
          end: format(transitionWindow.end, 'HH:mm'),
        },
        isInWindow: isInTransitionWindow,
        hasOvertime: hasUpcomingOvertime,
        overtimeInfo: periodState.overtimeInfo,
      },
      activity: {
        isCheckedIn,
        isInShiftTime,
      },
    });

    return {
      type: PeriodType.REGULAR,
      timeWindow: {
        start: format(shiftStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(shiftEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
      activity: {
        isActive: isCheckedIn && isInShiftTime,
        checkIn: attendance?.CheckInTime
          ? format(attendance.CheckInTime, "yyyy-MM-dd'T'HH:mm:ss.SSS")
          : null,
        checkOut: attendance?.CheckOutTime
          ? format(attendance.CheckOutTime, "yyyy-MM-dd'T'HH:mm:ss.SSS")
          : null,
        isOvertime: false,
        isDayOffOvertime: Boolean(periodState.overtimeInfo?.isDayOffOvertime),
        isInsideShiftHours: isInShiftTime,
      },
      validation: {
        isWithinBounds: isInShiftTime,
        isEarly: this.checkIfEarly(now, shiftStart),
        isLate: this.checkIfLate(now, shiftStart),
        isOvernight: shiftEnd < shiftStart,
        // Connect if we have next period OR we're in transition window with overtime
        isConnected:
          Boolean(periodState.nextPeriod) ||
          (isInTransitionWindow && hasUpcomingOvertime),
      },
    };
  }

  calculatePeriodTransitions(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): PeriodTransition[] {
    if (!window.overtimeInfo) return [];

    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
    );

    // Determine overtime position relative to shift
    const isPreShiftOvertime = overtimeStart < shiftStart;
    const isPostShiftOvertime = overtimeStart >= shiftEnd;

    console.log('Transition calculation:', {
      currentTime: format(now, 'HH:mm'),
      shift: {
        start: format(shiftStart, 'HH:mm'),
        end: format(shiftEnd, 'HH:mm'),
      },
      overtime: {
        start: format(overtimeStart, 'HH:mm'),
        isPreShift: isPreShiftOvertime,
        isPostShift: isPostShiftOvertime,
      },
    });

    // Handle pre-shift overtime
    if (isPreShiftOvertime) {
      const transitionWindow = {
        start: subMinutes(shiftStart, 15),
        end: shiftStart,
      };

      if (isWithinInterval(now, transitionWindow)) {
        return [
          {
            from: {
              periodIndex: 0,
              type: PeriodType.OVERTIME,
            },
            to: {
              periodIndex: 1,
              type: PeriodType.REGULAR,
            },
            transitionTime: window.shift.startTime,
            isComplete: false,
          },
        ];
      }
    }

    // Handle post-shift overtime
    if (isPostShiftOvertime) {
      const transitionWindow = {
        start: subMinutes(shiftEnd, 15),
        end: shiftEnd,
      };

      if (isWithinInterval(now, transitionWindow)) {
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
            transitionTime: window.overtimeInfo.startTime,
            isComplete: false,
          },
        ];
      }
    }

    return [];
  }

  private checkIfEarly(now: Date, start: Date): boolean {
    return isWithinInterval(now, {
      start: subMinutes(start, ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD),
      end: start,
    });
  }

  private checkIfLate(now: Date, start: Date): boolean {
    return isWithinInterval(now, {
      start,
      end: addMinutes(start, ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD),
    });
  }
}

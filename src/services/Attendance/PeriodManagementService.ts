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
    const periodStart = parseISO(periodState.current.start);
    const periodEnd = parseISO(periodState.current.end);
    // Add timezone offset to now for comparison
    const utcNow = addMinutes(now, now.getTimezoneOffset());

    const isCheckedIn = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );

    const isInShiftTime = isWithinInterval(utcNow, {
      start: periodStart,
      end: periodEnd,
    });

    return {
      type: periodState.type,
      timeWindow: {
        start: periodState.current.start,
        end: periodState.current.end,
      },
      activity: {
        isActive: isCheckedIn && isInShiftTime,
        checkIn: attendance?.CheckInTime?.toISOString() || null,
        checkOut: attendance?.CheckOutTime?.toISOString() || null,
        isOvertime: periodState.type === PeriodType.OVERTIME,
        overtimeId: periodState.overtimeInfo?.id,
        isDayOffOvertime: Boolean(periodState.overtimeInfo?.isDayOffOvertime),
        isInsideShiftHours: isInShiftTime, // Add this
      },
      validation: {
        isWithinBounds: isInShiftTime,
        isEarly: this.checkIfEarly(now, parseISO(periodState.current.start)),
        isLate: this.checkIfLate(now, parseISO(periodState.current.start)),
        isOvernight:
          parseISO(periodState.current.end) <
          parseISO(periodState.current.start),
        isConnected: Boolean(periodState.nextPeriod),
      },
    };
  }

  calculatePeriodTransitions(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): PeriodTransition[] {
    const transitions: PeriodTransition[] = [];

    if (window.transition?.isInTransition) {
      transitions.push({
        from: {
          periodIndex: 0,
          type: window.transition.from.type,
        },
        to: {
          periodIndex: 1,
          type: window.transition.to.type,
        },
        transitionTime: window.transition.to.start || window.current.end,
        isComplete: false,
      });
    }

    return transitions;
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

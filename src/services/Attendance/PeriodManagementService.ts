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
    // Parse all times
    const periodStart = parseISO(periodState.current.start);
    const periodEnd = parseISO(periodState.current.end);
    const checkInTime = attendance?.CheckInTime
      ? parseISO(format(attendance.CheckInTime, "yyyy-MM-dd'T'HH:mm:ss.SSS"))
      : null;

    console.log('Time debug:', {
      periodStart: format(periodStart, 'HH:mm'),
      periodEnd: format(periodEnd, 'HH:mm'),
      checkInTime: checkInTime ? format(checkInTime, 'HH:mm') : null,
      now: format(now, 'HH:mm'),
    });

    const isCheckedIn = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );

    // If checked in at 09:00 and shift is 08:00-17:00, this should be true
    const isInShiftTime = isWithinInterval(now, {
      start: periodStart,
      end: periodEnd,
    });

    console.log('Validation checks:', {
      isCheckedIn,
      isInShiftTime,
      withinBounds: {
        now: format(now, 'HH:mm'),
        start: format(periodStart, 'HH:mm'),
        end: format(periodEnd, 'HH:mm'),
      },
    });

    return {
      type: periodState.type,
      timeWindow: {
        start: periodState.current.start,
        end: periodState.current.end,
      },
      activity: {
        isActive: isCheckedIn && isInShiftTime,
        checkIn: attendance?.CheckInTime
          ? format(attendance.CheckInTime, "yyyy-MM-dd'T'HH:mm:ss.SSS")
          : null,
        checkOut: attendance?.CheckOutTime
          ? format(attendance.CheckOutTime, "yyyy-MM-dd'T'HH:mm:ss.SSS")
          : null,
        isOvertime: periodState.type === PeriodType.OVERTIME,
        overtimeId: periodState.overtimeInfo?.id,
        isDayOffOvertime: Boolean(periodState.overtimeInfo?.isDayOffOvertime),
        isInsideShiftHours: isInShiftTime,
      },
      validation: {
        isWithinBounds: isInShiftTime,
        isEarly: this.checkIfEarly(now, periodStart),
        isLate: this.checkIfLate(now, periodStart),
        isOvernight: periodEnd < periodStart,
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

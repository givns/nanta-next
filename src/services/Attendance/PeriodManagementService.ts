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
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
    );

    const checkInTime = attendance?.CheckInTime
      ? parseISO(format(attendance.CheckInTime, "yyyy-MM-dd'T'HH:mm:ss.SSS"))
      : null;

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
      activity: {
        isCheckedIn,
        isInShiftTime,
        checkInTime: checkInTime ? format(checkInTime, 'HH:mm') : null,
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
    const shiftEnd = parseISO(window.current.end);

    // Check for upcoming transitions regardless of completion
    const isApproachingTransition = isWithinInterval(now, {
      start: subMinutes(shiftEnd, 15),
      end: addMinutes(shiftEnd, 15),
    });

    if (window.nextPeriod && isApproachingTransition) {
      transitions.push({
        from: {
          periodIndex: 0,
          type: currentState.type,
        },
        to: {
          periodIndex: 1,
          type: window.nextPeriod.type,
        },
        transitionTime: window.nextPeriod.startTime || window.current.end,
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

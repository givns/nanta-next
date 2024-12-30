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
    // For regular period, always use shift times
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
    );

    // For overtime, use overtime window if available
    const isOvertimePeriod = periodState.type === PeriodType.OVERTIME;
    const overtimeStart =
      isOvertimePeriod && periodState.overtimeInfo
        ? parseISO(
            `${format(now, 'yyyy-MM-dd')}T${periodState.overtimeInfo.startTime}`,
          )
        : null;
    const overtimeEnd =
      isOvertimePeriod && periodState.overtimeInfo
        ? parseISO(
            `${format(now, 'yyyy-MM-dd')}T${periodState.overtimeInfo.endTime}`,
          )
        : null;

    // Determine which times to use for window
    const periodStart =
      isOvertimePeriod && overtimeStart ? overtimeStart : shiftStart;
    const periodEnd = isOvertimePeriod && overtimeEnd ? overtimeEnd : shiftEnd;

    // Activity status
    const isCheckedIn = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );
    const checkInTime = attendance?.CheckInTime
      ? parseISO(format(attendance.CheckInTime, "yyyy-MM-dd'T'HH:mm:ss.SSS"))
      : null;

    // Inside hours check uses appropriate period window
    const isInShiftTime = isWithinInterval(now, {
      start: periodStart,
      end: periodEnd,
    });

    // Debug logging
    console.log('Period resolution:', {
      currentTime: format(now, 'HH:mm'),
      periodType: periodState.type,
      shiftWindow: {
        start: format(shiftStart, 'HH:mm'),
        end: format(shiftEnd, 'HH:mm'),
      },
      overtimeWindow: overtimeStart
        ? {
            start: format(overtimeStart, 'HH:mm'),
            end: format(overtimeEnd!, 'HH:mm'),
          }
        : null,
      isCheckedIn,
      isInShiftTime,
      checkInTime: checkInTime ? format(checkInTime, 'HH:mm') : null,
    });

    return {
      type: periodState.type,
      timeWindow: {
        start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
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
        isDayOffOvertime: Boolean(periodState.overtimeInfo?.isDayOffOvertime),
        isInsideShiftHours: isInShiftTime,
        overtimeId: periodState.overtimeInfo?.id,
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

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
  startOfDay,
  endOfDay,
} from 'date-fns';

export class PeriodManagementService {
  resolveCurrentPeriod(
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    now: Date,
  ): UnifiedPeriodState {
    // Validate shift data first
    const isValidShift = Boolean(
      periodState.shift?.startTime &&
        periodState.shift?.endTime &&
        periodState.shift?.id,
    );

    // Debug validation
    console.log('Shift validation:', {
      hasShift: Boolean(periodState.shift),
      startTime: periodState.shift?.startTime,
      endTime: periodState.shift?.endTime,
      id: periodState.shift?.id,
      isValid: isValidShift,
    });

    // Get default time window if shift is invalid
    const defaultWindow = {
      start: format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      end: format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
    };

    try {
      // Parse shift times if valid
      const timeWindow = isValidShift
        ? {
            start: format(
              parseISO(
                `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
              ),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            end: format(
              parseISO(
                `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
              ),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
          }
        : defaultWindow;

      // Core status checks
      const isCheckedIn = Boolean(
        attendance?.CheckInTime && !attendance?.CheckOutTime,
      );
      const isInShiftTime = isValidShift
        ? isWithinInterval(now, {
            start: parseISO(timeWindow.start),
            end: parseISO(timeWindow.end),
          })
        : false;

      // Check for transition conditions if shift is valid
      const transitionWindow = isValidShift
        ? {
            start: subMinutes(parseISO(timeWindow.end), 5),
            end: addMinutes(parseISO(timeWindow.end), 15), // Added 15 minutes after
          }
        : null;

      const hasUpcomingOvertime = Boolean(
        isValidShift &&
          periodState.overtimeInfo?.startTime === periodState.shift.endTime,
      );

      const isInTransitionWindow = transitionWindow
        ? isWithinInterval(now, transitionWindow)
        : false;

      // Debug logging
      console.log('Period resolution:', {
        currentTime: format(now, 'HH:mm'),
        shift: {
          isValid: isValidShift,
          startTime: periodState.shift?.startTime,
          endTime: periodState.shift?.endTime,
        },
        window: {
          start: format(parseISO(timeWindow.start), 'HH:mm'),
          end: format(parseISO(timeWindow.end), 'HH:mm'),
        },
        transition: transitionWindow
          ? {
              start: format(transitionWindow.start, 'HH:mm'),
              end: format(transitionWindow.end, 'HH:mm'),
              isInWindow: isInTransitionWindow,
              hasOvertime: hasUpcomingOvertime,
              overtimeInfo: periodState.overtimeInfo,
            }
          : null,
        activity: {
          isCheckedIn,
          isInShiftTime,
        },
      });

      return {
        type: PeriodType.REGULAR,
        timeWindow,
        activity: {
          isActive: isCheckedIn && isInShiftTime,
          checkIn: attendance?.CheckInTime
            ? format(
                new Date(attendance.CheckInTime),
                "yyyy-MM-dd'T'HH:mm:ss.SSS",
              )
            : null,
          checkOut: attendance?.CheckOutTime
            ? format(
                new Date(attendance.CheckOutTime),
                "yyyy-MM-dd'T'HH:mm:ss.SSS",
              )
            : null,
          isOvertime: false,
          isDayOffOvertime: Boolean(periodState.overtimeInfo?.isDayOffOvertime),
          isInsideShiftHours: isInShiftTime,
        },
        validation: {
          isWithinBounds: isInShiftTime,
          isEarly: isValidShift
            ? this.checkIfEarly(now, parseISO(timeWindow.start))
            : false,
          isLate: isValidShift
            ? this.checkIfLate(now, parseISO(timeWindow.start))
            : false,
          isOvernight: isValidShift
            ? parseISO(timeWindow.end) < parseISO(timeWindow.start)
            : false,
          isConnected:
            isValidShift && isInTransitionWindow && hasUpcomingOvertime,
        },
      };
    } catch (error) {
      console.error('Error resolving period:', error);
      // Return safe defaults on error
      return {
        type: PeriodType.REGULAR,
        timeWindow: defaultWindow,
        activity: {
          isActive: false,
          checkIn: null,
          checkOut: null,
          isOvertime: false,
          isDayOffOvertime: false,
          isInsideShiftHours: false,
        },
        validation: {
          isWithinBounds: false,
          isEarly: false,
          isLate: false,
          isOvernight: false,
          isConnected: false,
        },
      };
    }
  }

  calculatePeriodTransitions(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): PeriodTransition[] {
    // Don't attempt transitions for invalid shifts
    if (!window.overtimeInfo || !window.shift?.endTime || !window.shift?.id) {
      return [];
    }

    try {
      const shiftEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
      );
      const transitionWindow = {
        start: subMinutes(shiftEnd, 15),
        end: shiftEnd,
      };

      const isInTransitionWindow = isWithinInterval(now, transitionWindow);
      const hasUpcomingOvertime =
        window.overtimeInfo.startTime === window.shift.endTime;

      console.log('Transition calculation:', {
        currentTime: format(now, 'HH:mm'),
        shift: { end: format(shiftEnd, 'HH:mm') },
        window: {
          start: format(transitionWindow.start, 'HH:mm'),
          end: format(transitionWindow.end, 'HH:mm'),
        },
        conditions: {
          isInWindow: isInTransitionWindow,
          hasOvertime: hasUpcomingOvertime,
        },
      });

      if (isInTransitionWindow && hasUpcomingOvertime) {
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
            transitionTime: window.shift.endTime,
            isComplete: false,
          },
        ];
      }
    } catch (error) {
      console.error('Error calculating transitions:', error);
    }

    return [];
  }

  private checkIfEarly(now: Date, start: Date): boolean {
    try {
      return isWithinInterval(now, {
        start: subMinutes(start, ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD),
        end: start,
      });
    } catch (error) {
      console.error('Error checking early status:', error);
      return false;
    }
  }

  private checkIfLate(now: Date, start: Date): boolean {
    try {
      return isWithinInterval(now, {
        start,
        end: addMinutes(start, ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD),
      });
    } catch (error) {
      console.error('Error checking late status:', error);
      return false;
    }
  }
}

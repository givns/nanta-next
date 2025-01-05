import {
  PeriodTransition,
  ShiftWindowResponse,
  UnifiedPeriodState,
  AttendanceRecord,
  OvertimeContext,
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
  differenceInMinutes,
} from 'date-fns';

interface TransitionWindowConfig {
  EARLY_BUFFER: number; // minutes before shift end
  LATE_BUFFER: number; // minutes after shift end
}

const TRANSITION_CONFIG: TransitionWindowConfig = {
  EARLY_BUFFER: 5, // 5 minutes before shift end
  LATE_BUFFER: 15, // 15 minutes after shift end
};

interface TransitionDefinition {
  from: {
    type: PeriodType;
    end: string;
  };
  to: {
    type: PeriodType;
    start: string;
  };
  isInTransition: boolean;
  direction: 'to_overtime' | 'to_regular';
}

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

    const isValidOvertime = Boolean(
      periodState.overtimeInfo?.startTime && periodState.overtimeInfo?.endTime,
    );

    // Get default time window if shift is invalid
    const defaultWindow = {
      start: format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      end: format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
    };

    try {
      // Determine time window based on current period type
      const timeWindow = isValidOvertime
        ? {
            start: format(
              parseISO(
                `${format(now, 'yyyy-MM-dd')}T${periodState.overtimeInfo?.startTime}`,
              ),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            end: format(
              parseISO(
                `${format(now, 'yyyy-MM-dd')}T${periodState.overtimeInfo?.endTime}`,
              ),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
          }
        : isValidShift
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

      // Calculate potential transitions
      const transitions = this.calculatePeriodTransitions(
        // You'd need to pass an initial state object here
        {} as UnifiedPeriodState,
        periodState,
        now,
      );

      // Check if there's an active transition
      const hasActiveTransition = transitions.length > 0;

      // Modified overtime determination to consider transition window and attendance state
      const isOvertimePeriod = Boolean(
        attendance?.isOvertime || // Existing overtime state
          (isValidOvertime &&
            // Within overtime window
            (isWithinInterval(now, {
              start: parseISO(timeWindow.start),
              end: parseISO(timeWindow.end),
            }) ||
              // Or in transition window with upcoming overtime
              (isInTransitionWindow && hasUpcomingOvertime))),
      );

      console.log('Overtime state determination:', {
        currentTime: format(now, 'HH:mm'),
        existingOvertime: attendance?.isOvertime,
        inTransitionWindow: isInTransitionWindow,
        hasUpcomingOvertime,
        transitionWindow: transitionWindow
          ? {
              start: format(transitionWindow.start, 'HH:mm'),
              end: format(transitionWindow.end, 'HH:mm'),
            }
          : null,
        overtimeWindow: {
          start: periodState.overtimeInfo?.startTime,
          end: periodState.overtimeInfo?.endTime,
        },
        isOvertimePeriod,
      });

      // Determine period type based on transitions
      const periodType = isOvertimePeriod
        ? PeriodType.OVERTIME
        : PeriodType.REGULAR;

      // Early check calculation (only for regular period)
      const isEarlyCheck =
        !isOvertimePeriod &&
        isValidShift &&
        this.checkIfEarly(now, parseISO(timeWindow.start));

      // Late check calculation (only for regular period)
      const isLateCheck =
        !isOvertimePeriod &&
        isValidShift &&
        this.checkIfLate(now, parseISO(timeWindow.start));

      // Overnight calculation
      const isOvernightShift =
        isValidShift &&
        parseISO(timeWindow.end).getDate() >
          parseISO(timeWindow.start).getDate();

      console.log('Period validation calculations:', {
        currentTime: format(now, 'HH:mm'),
        periodType,
        isOvertimePeriod: isOvertimePeriod,
        regularValidation: {
          isEarly: isEarlyCheck,
          isLate: isLateCheck,
          isWithinBounds: isInShiftTime || isEarlyCheck,
          isOvernight: isOvernightShift,
        },
        overtimeValidation: {
          isWithinBounds: isOvertimePeriod,
          isOvernight: isOvernightShift,
        },
      });

      return {
        type: periodType,
        timeWindow,
        activity: {
          isActive: isCheckedIn && (isOvertimePeriod || hasActiveTransition),
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
          isOvertime: isOvertimePeriod,
          isDayOffOvertime: Boolean(periodState.overtimeInfo?.isDayOffOvertime),
          isInsideShiftHours: isInShiftTime,
        },
        validation: isOvertimePeriod
          ? {
              // Overtime validation
              isWithinBounds: isOvertimePeriod,
              isEarly: false, // No early check for overtime
              isLate: false, // No late check for overtime
              isOvernight: isOvernightShift,
              isConnected: hasActiveTransition,
            }
          : {
              // Regular period validation
              isWithinBounds: isInShiftTime || isEarlyCheck,
              isEarly: isEarlyCheck,
              isLate: isLateCheck,
              isOvernight: isOvernightShift,
              isConnected: hasActiveTransition,
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

      // Updated transition window calculation
      const transitionWindow = {
        start: subMinutes(shiftEnd, TRANSITION_CONFIG.EARLY_BUFFER),
        end: addMinutes(shiftEnd, TRANSITION_CONFIG.LATE_BUFFER),
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

  public checkIfEarly(now: Date, start: Date): boolean {
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
      // Add debug logging
      const lateThreshold = addMinutes(
        start,
        ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
      );
      const isLate = now > lateThreshold;

      console.log('Late check calculation:', {
        currentTime: format(now, 'HH:mm'),
        shiftStart: format(start, 'HH:mm'),
        lateThreshold: format(lateThreshold, 'HH:mm'),
        isLate,
        minutesLate: differenceInMinutes(now, start),
      });

      return isLate;
    } catch (error) {
      console.error('Error checking late status:', error);
      return false;
    }
  }
}

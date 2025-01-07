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

const VALIDATION_THRESHOLDS = {
  OVERTIME_CHECKOUT: 15, // 15 minutes threshold for overtime checkout
  EARLY_CHECKIN: 30, // 30 minutes before shift start
  LATE_CHECKOUT: 15, // 15 minutes after shift end
} as const;

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

    const isCheckedIn = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );

    try {
      // First, determine transition state
      const shiftEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
      );
      const transitionWindow = {
        start: subMinutes(shiftEnd, 5),
        end: addMinutes(shiftEnd, 15),
      };

      const isInTransitionWindow = isWithinInterval(now, transitionWindow);
      const hasUpcomingOvertime = Boolean(
        periodState.overtimeInfo?.startTime === periodState.shift.endTime,
      );
      const isInTransitionState = isInTransitionWindow && hasUpcomingOvertime;

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

      // If in transition state, special handling
      if (isInTransitionState && !attendance?.isOvertime) {
        return {
          type: PeriodType.REGULAR, // Still in regular period during transition
          timeWindow: {
            start: format(
              parseISO(
                `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
              ),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            end: format(shiftEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          },
          activity: {
            isActive: isCheckedIn,
            checkIn: attendance?.CheckInTime
              ? format(
                  new Date(attendance.CheckInTime),
                  "yyyy-MM-dd'T'HH:mm:ss.SSS",
                )
              : null,
            checkOut: null,
            isOvertime: false,
            isDayOffOvertime: false,
            isInsideShiftHours: true,
          },
          validation: {
            isWithinBounds: true, // Always true in transition window
            isEarly: false,
            isLate: false,
            isOvernight: false,
            isConnected: true, // Indicates transition availability
          },
        };
      }

      // Determine period type and time window
      const isOvertimeActive = Boolean(attendance?.isOvertime);

      // Determine time window based on current period type
      const timeWindow =
        isOvertimeActive && isValidOvertime
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
      const isInShiftTime = isValidShift
        ? isWithinInterval(now, {
            start: parseISO(timeWindow.start),
            end: parseISO(timeWindow.end),
          })
        : false;

      // Overnight calculation
      const isOvernightShift =
        isValidShift &&
        parseISO(timeWindow.end).getDate() >
          parseISO(timeWindow.start).getDate();

      const isOvertimePeriod = Boolean(
        attendance?.isOvertime || // Existing overtime state
          (isValidOvertime &&
            isWithinInterval(now, {
              start: parseISO(timeWindow.start),
              end: parseISO(timeWindow.end),
            })),
      );

      // Early/Late check calculations
      const isEarlyCheck =
        !isOvertimePeriod &&
        isValidShift &&
        this.checkIfEarly(now, parseISO(timeWindow.start));

      const isLateCheck =
        !isOvertimePeriod &&
        isValidShift &&
        this.checkIfLate(now, parseISO(timeWindow.start));

      console.log('Period validation calculations:', {
        currentTime: format(now, 'HH:mm'),
        periodType: isOvertimePeriod ? 'OVERTIME' : 'REGULAR',
        isOvertimePeriod,
        shift: {
          start: periodState.shift?.startTime,
          end: periodState.shift?.endTime,
          isOvernight: isOvernightShift,
        },
        overtime: {
          start: periodState.overtimeInfo?.startTime,
          end: periodState.overtimeInfo?.endTime,
          isOvernight: false,
        },
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
        type: isOvertimePeriod ? PeriodType.OVERTIME : PeriodType.REGULAR,
        timeWindow,
        activity: {
          isActive: isCheckedIn,
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
              isWithinBounds: isOvertimePeriod,
              isEarly: false,
              isLate: false,
              isOvernight: isOvernightShift,
              isConnected: false,
            }
          : {
              isWithinBounds: isInShiftTime || isEarlyCheck,
              isEarly: isEarlyCheck,
              isLate: isLateCheck,
              isOvernight: isOvernightShift,
              isConnected: false,
            },
      };
    } catch (error) {
      console.error('Error resolving period:', error);
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

  private isOvernightPeriod(start: string, end: string): boolean {
    try {
      const startTime = start.split(':').map(Number);
      const endTime = end.split(':').map(Number);

      // If end time is less than start time, it's overnight
      if (
        endTime[0] < startTime[0] ||
        (endTime[0] === startTime[0] && endTime[1] < startTime[1])
      ) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking overnight period:', error);
      return false;
    }
  }

  // Add this helper method to the class
  private isWithinOvertimeCheckout(now: Date, overtimeEnd: string): boolean {
    try {
      const end = parseISO(`${format(now, 'yyyy-MM-dd')}T${overtimeEnd}`);
      return isWithinInterval(now, {
        start: end,
        end: addMinutes(end, VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT),
      });
    } catch (error) {
      console.error('Error checking overtime checkout:', error);
      return false;
    }
  }

  private isWithinOvernightPeriod(
    now: Date,
    timeWindow: { start: string; end: string },
  ): boolean {
    try {
      const dayStart = startOfDay(now);
      const dayEnd = endOfDay(now);
      const periodStart = parseISO(timeWindow.start);
      const periodEnd = parseISO(timeWindow.end);

      // For overnight periods, check if we're in either day's time range
      if (periodEnd < periodStart) {
        // Check if we're after start time today or before end time tomorrow
        return (
          (now >= periodStart && now <= dayEnd) ||
          (now >= dayStart && now <= periodEnd)
        );
      }

      return isWithinInterval(now, {
        start: periodStart,
        end: periodEnd,
      });
    } catch (error) {
      console.error('Error checking overnight period:', error);
      return false;
    }
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

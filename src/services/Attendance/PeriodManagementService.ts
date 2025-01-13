import {
  PeriodTransition,
  ShiftWindowResponse,
  UnifiedPeriodState,
  AttendanceRecord,
  OvertimeContext,
  PeriodDefinition,
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
  addDays,
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
  LATE_CHECKIN: 15, // 15 minutes after shift start
} as const;

export class PeriodManagementService {
  // In PeriodManagementService.ts

  resolveCurrentPeriod(
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    now: Date,
  ): UnifiedPeriodState {
    // Prepare periods from shift and overtime
    const periods: PeriodDefinition[] = [
      ...(periodState.overtimeInfo
        ? [
            {
              type: PeriodType.OVERTIME,
              startTime: periodState.overtimeInfo.startTime,
              endTime: periodState.overtimeInfo.endTime,
              sequence: 1,
              isOvernight:
                this.isOvernightPeriod(
                  periodState.overtimeInfo.startTime,
                  periodState.overtimeInfo.endTime,
                ) ?? false, // Ensure boolean
              isDayOff: periodState.overtimeInfo.isDayOffOvertime ?? false,
            },
          ]
        : []),
      {
        type: PeriodType.REGULAR,
        startTime: periodState.shift.startTime,
        endTime: periodState.shift.endTime,
        sequence: 2,
        isOvernight:
          this.isOvernightPeriod(
            periodState.shift.startTime,
            periodState.shift.endTime,
          ) ?? false, // Ensure boolean
      },
    ];

    // Default time window
    const defaultWindow = {
      start: format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      end: format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
    };

    try {
      // Helper function to parse time with current date context
      const parseTimeWithContext = (
        timeString: string,
        referenceDate: Date,
      ) => {
        const [hours, minutes] = timeString.split(':').map(Number);
        const parsedTime = new Date(referenceDate);
        parsedTime.setHours(hours, minutes, 0, 0);
        return parsedTime;
      };

      // 1. Handle active attendance first
      if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
        const activePeriod = periods.find((period) => {
          const periodStart = parseTimeWithContext(period.startTime, now);
          const periodEnd = parseTimeWithContext(period.endTime, now);

          // Adjust for overnight periods
          if (period.isOvernight && periodEnd < periodStart) {
            periodEnd.setDate(periodEnd.getDate() + 1);
          }

          return now >= periodStart && now <= periodEnd;
        });

        if (activePeriod) {
          return {
            type: activePeriod.type,
            timeWindow: {
              start: format(
                parseTimeWithContext(activePeriod.startTime, now),
                "yyyy-MM-dd'T'HH:mm:ss.SSS",
              ),
              end: format(
                parseTimeWithContext(activePeriod.endTime, now),
                "yyyy-MM-dd'T'HH:mm:ss.SSS",
              ),
            },
            activity: {
              isActive: true,
              checkIn: format(
                new Date(attendance.CheckInTime),
                "yyyy-MM-dd'T'HH:mm:ss.SSS",
              ),
              checkOut: null,
              isOvertime: activePeriod.type === PeriodType.OVERTIME,
              isDayOffOvertime: Boolean(activePeriod.isDayOff),
              isInsideShiftHours: activePeriod.type === PeriodType.REGULAR,
            },
            validation: {
              isWithinBounds: true,
              isEarly: false,
              isLate: false,
              isOvernight: activePeriod.isOvernight || false, // Ensure boolean
              isConnected: false,
            },
          };
        }
      }

      // 2. Find current period
      const currentPeriod = periods.find((period) => {
        const periodStart = parseTimeWithContext(period.startTime, now);
        const periodEnd = parseTimeWithContext(period.endTime, now);

        // Adjust for overnight periods
        if (period.isOvernight && periodEnd < periodStart) {
          periodEnd.setDate(periodEnd.getDate() + 1);
        }

        return now >= periodStart && now <= periodEnd;
      });

      // Detailed logging
      console.log('Period Resolution Debug:', {
        currentTime: format(now, 'HH:mm'),
        resolvedPeriod: currentPeriod
          ? {
              type: currentPeriod.type,
              startTime: currentPeriod.startTime,
              endTime: currentPeriod.endTime,
              isOvernight: currentPeriod.isOvernight,
            }
          : 'No period found',
      });

      // If no current period found
      if (!currentPeriod) {
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

      // Return current period state
      return {
        type: currentPeriod.type,
        timeWindow: {
          start: format(
            parseTimeWithContext(currentPeriod.startTime, now),
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
          ),
          end: format(
            parseTimeWithContext(currentPeriod.endTime, now),
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
          ),
        },
        activity: {
          isActive: false,
          checkIn: null,
          checkOut: null,
          isOvertime: currentPeriod.type === PeriodType.OVERTIME,
          isDayOffOvertime: Boolean(currentPeriod.isDayOff),
          isInsideShiftHours: currentPeriod.type === PeriodType.REGULAR,
        },
        validation: {
          isWithinBounds: true,
          isEarly: now < parseTimeWithContext(currentPeriod.startTime, now),
          isLate: now > parseTimeWithContext(currentPeriod.endTime, now),
          isOvernight: currentPeriod.isOvernight || false, // Ensure boolean
          isConnected: Boolean(periodState.overtimeInfo),
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

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
  LATE_CHECKIN: 15, // 15 minutes after shift start
} as const;

export class PeriodManagementService {
  // In PeriodManagementService.ts

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
      // Debug validation
      console.log('Period resolution:', {
        currentTime: format(now, 'HH:mm'),
        hasShift: isValidShift,
        hasOvertime: isValidOvertime,
        attendance: attendance
          ? {
              checkIn: attendance.CheckInTime,
              checkOut: attendance.CheckOutTime,
              type: attendance.type,
            }
          : null,
      });

      // Determine period windows
      const shiftWindow = isValidShift
        ? {
            start: parseISO(
              `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
            ),
            end: parseISO(
              `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
            ),
          }
        : null;

      const overtimeWindow = isValidOvertime
        ? {
            start: parseISO(
              `${format(now, 'yyyy-MM-dd')}T${periodState.overtimeInfo!.startTime}`,
            ),
            end: parseISO(
              `${format(now, 'yyyy-MM-dd')}T${periodState.overtimeInfo!.endTime}`,
            ),
          }
        : null;

      // If there's an active attendance record, use its type
      if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
        const timeWindow =
          attendance.type === PeriodType.OVERTIME && overtimeWindow
            ? {
                start: format(
                  overtimeWindow.start,
                  "yyyy-MM-dd'T'HH:mm:ss.SSS",
                ),
                end: format(overtimeWindow.end, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
              }
            : shiftWindow
              ? {
                  start: format(shiftWindow.start, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
                  end: format(shiftWindow.end, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
                }
              : defaultWindow;

        return {
          type: attendance.type,
          timeWindow,
          activity: {
            isActive: true,
            checkIn: format(
              new Date(attendance.CheckInTime),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            checkOut: null,
            isOvertime: attendance.type === PeriodType.OVERTIME,
            isDayOffOvertime: Boolean(
              periodState.overtimeInfo?.isDayOffOvertime,
            ),
            isInsideShiftHours: attendance.type === PeriodType.REGULAR,
          },
          validation: {
            isWithinBounds: true,
            isEarly: false,
            isLate: false,
            isOvernight: this.isOvernightPeriod(
              attendance.type === PeriodType.OVERTIME
                ? periodState.overtimeInfo!.startTime
                : periodState.shift.startTime,
              attendance.type === PeriodType.OVERTIME
                ? periodState.overtimeInfo!.endTime
                : periodState.shift.endTime,
            ),
            isConnected: false,
          },
        };
      }

      // Early overtime check (before regular shift)
      const isEarlyOvertimePeriod =
        overtimeWindow &&
        shiftWindow &&
        overtimeWindow.start < shiftWindow.start;

      if (isEarlyOvertimePeriod) {
        const overtimeEarlyThreshold = subMinutes(
          overtimeWindow.start,
          VALIDATION_THRESHOLDS.EARLY_CHECKIN,
        );

        // If we're approaching or in early overtime period
        if (now >= overtimeEarlyThreshold) {
          const isWithinOvertimeBounds = isWithinInterval(now, {
            start: overtimeWindow.start,
            end: overtimeWindow.end,
          });

          return {
            type: PeriodType.OVERTIME,
            timeWindow: {
              start: format(overtimeWindow.start, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
              end: format(overtimeWindow.end, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
            },
            activity: {
              isActive: false,
              checkIn: null,
              checkOut: null,
              isOvertime: true,
              isDayOffOvertime: Boolean(
                periodState.overtimeInfo?.isDayOffOvertime,
              ),
              isInsideShiftHours: false,
            },
            validation: {
              isWithinBounds: isWithinOvertimeBounds,
              isEarly: now < overtimeWindow.start,
              isLate: false,
              isOvernight: this.isOvernightPeriod(
                periodState.overtimeInfo!.startTime,
                periodState.overtimeInfo!.endTime,
              ),
              isConnected: false,
            },
          };
        }
      }

      // Check for regular post-shift overtime period
      if (
        overtimeWindow &&
        isWithinInterval(now, {
          start: overtimeWindow.start,
          end: overtimeWindow.end,
        })
      ) {
        return {
          type: PeriodType.OVERTIME,
          timeWindow: {
            start: format(overtimeWindow.start, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
            end: format(overtimeWindow.end, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          },
          activity: {
            isActive: false,
            checkIn: null,
            checkOut: null,
            isOvertime: true,
            isDayOffOvertime: Boolean(
              periodState.overtimeInfo?.isDayOffOvertime,
            ),
            isInsideShiftHours: false,
          },
          validation: {
            isWithinBounds: true,
            isEarly: false,
            isLate: false,
            isOvernight: this.isOvernightPeriod(
              periodState.overtimeInfo!.startTime,
              periodState.overtimeInfo!.endTime,
            ),
            isConnected: false,
          },
        };
      }

      // Regular period handling
      if (shiftWindow) {
        const shiftEarlyThreshold = subMinutes(
          shiftWindow.start,
          VALIDATION_THRESHOLDS.EARLY_CHECKIN,
        );

        const isEarly = isWithinInterval(now, {
          start: shiftEarlyThreshold,
          end: shiftWindow.start,
        });

        const isLate =
          now >
          addMinutes(shiftWindow.start, VALIDATION_THRESHOLDS.LATE_CHECKIN);

        const isWithinShiftBounds = isWithinInterval(now, {
          start: shiftWindow.start,
          end: shiftWindow.end,
        });

        return {
          type: PeriodType.REGULAR,
          timeWindow: {
            start: format(shiftWindow.start, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
            end: format(shiftWindow.end, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          },
          activity: {
            isActive: false,
            checkIn: null,
            checkOut: null,
            isOvertime: false,
            isDayOffOvertime: false,
            isInsideShiftHours: isWithinShiftBounds,
          },
          validation: {
            isWithinBounds: isWithinShiftBounds || isEarly,
            isEarly,
            isLate,
            isOvernight: this.isOvernightPeriod(
              periodState.shift.startTime,
              periodState.shift.endTime,
            ),
            isConnected: false,
          },
        };
      }

      // Default fallback
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

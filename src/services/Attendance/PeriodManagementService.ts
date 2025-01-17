import {
  PeriodTransition,
  ShiftWindowResponse,
  UnifiedPeriodState,
  AttendanceRecord,
  PeriodDefinition,
  VALIDATION_THRESHOLDS,
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

export class PeriodManagementService {
  resolveCurrentPeriod(
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    now: Date,
  ): UnifiedPeriodState {
    // Create periods array with proper chronological order
    const periods: PeriodDefinition[] = this.buildPeriodSequence(
      periodState,
      now,
    );

    // Handle active attendance first
    if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
      return this.resolveActivePeriod(attendance, periods, now);
    }

    // Find relevant period (either current or upcoming)
    const relevantPeriod = this.findRelevantPeriod(periods, now);
    if (!relevantPeriod) {
      return this.createDefaultPeriodState(now);
    }

    // Check if we're in a waiting state for overtime
    const isWaitingForOvertime = this.isWaitingForOvertimePeriod(
      now,
      periods,
      attendance,
    );

    if (isWaitingForOvertime) {
      const overtimePeriod = periods.find(
        (p) => p.type === PeriodType.OVERTIME,
      );
      if (overtimePeriod) {
        return {
          type: PeriodType.OVERTIME, // Set type as overtime even when waiting
          timeWindow: {
            start: format(
              this.parseTimeWithContext(overtimePeriod.startTime, now),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            end: format(
              this.parseTimeWithContext(overtimePeriod.endTime, now),
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
          },
          activity: {
            isActive: false,
            checkIn: null,
            checkOut: null,
            isOvertime: true,
            isDayOffOvertime: Boolean(overtimePeriod.isDayOff),
            isInsideShiftHours: false,
          },
          validation: {
            isWithinBounds: false,
            isEarly: true, // Indicate it's early for the overtime period
            isLate: false,
            isOvernight: overtimePeriod.isOvernight || false,
            isConnected: true, // Connected to previous regular period
          },
        };
      }
    }

    // Default period state creation (existing code)
    return {
      type: relevantPeriod.type,
      timeWindow: {
        start: format(
          this.parseTimeWithContext(relevantPeriod.startTime, now),
          "yyyy-MM-dd'T'HH:mm:ss.SSS",
        ),
        end: format(
          this.parseTimeWithContext(relevantPeriod.endTime, now),
          "yyyy-MM-dd'T'HH:mm:ss.SSS",
        ),
      },
      activity: {
        isActive: false,
        checkIn: null,
        checkOut: null,
        isOvertime: relevantPeriod.type === PeriodType.OVERTIME,
        isDayOffOvertime: Boolean(relevantPeriod.isDayOff),
        isInsideShiftHours: relevantPeriod.type === PeriodType.REGULAR,
      },
      validation: {
        isWithinBounds: true,
        isEarly: now < this.parseTimeWithContext(relevantPeriod.startTime, now),
        isLate: now > this.parseTimeWithContext(relevantPeriod.endTime, now),
        isOvernight: relevantPeriod.isOvernight || false,
        isConnected: Boolean(periodState.overtimeInfo),
      },
    };
  }

  private isWaitingForOvertimePeriod(
    now: Date,
    periods: PeriodDefinition[],
    lastAttendance: AttendanceRecord | null,
  ): boolean {
    // Check if there's a completed regular period
    const hasCompletedRegular =
      lastAttendance?.type === PeriodType.REGULAR &&
      lastAttendance.CheckOutTime !== null && // Check explicitly for null
      lastAttendance.state === 'PRESENT';

    if (!hasCompletedRegular || !lastAttendance?.CheckOutTime) return false; // Early return if no checkout time

    // Find next overtime period
    const nextOvertime = periods.find(
      (p) =>
        p.type === PeriodType.OVERTIME &&
        this.parseTimeWithContext(p.startTime, now) > now,
    );

    if (!nextOvertime) return false;

    const overtimeStart = this.parseTimeWithContext(
      nextOvertime.startTime,
      now,
    );
    const approachWindow = subMinutes(overtimeStart, 30);

    // Now we can safely use CheckOutTime as we've checked it's not null
    return now >= lastAttendance.CheckOutTime && now <= overtimeStart;
  }

  private buildPeriodSequence(
    periodState: ShiftWindowResponse,
    now: Date,
  ): PeriodDefinition[] {
    const periods: PeriodDefinition[] = [];

    // Add early morning overtime if exists
    if (
      periodState.overtimeInfo &&
      this.isEarlyMorningOvertime(
        periodState.overtimeInfo.startTime,
        periodState.shift.startTime,
      )
    ) {
      periods.push({
        type: PeriodType.OVERTIME,
        startTime: periodState.overtimeInfo.startTime,
        endTime: periodState.overtimeInfo.endTime,
        sequence: 1,
        isOvernight: this.isOvernightPeriod(
          periodState.overtimeInfo.startTime,
          periodState.overtimeInfo.endTime,
        ),
        isDayOff: periodState.overtimeInfo.isDayOffOvertime,
      });
    }

    // First check if we have completed regular period and pending overtime
    if (periodState.overtimeInfo) {
      const otStart = this.parseTimeWithContext(
        periodState.overtimeInfo.startTime,
        now,
      );
      const regularEnd = this.parseTimeWithContext(
        periodState.shift.endTime,
        now,
      );

      // If we're between regular end and overtime start
      if (now > regularEnd && now < otStart) {
        // Only include overtime period as it's the relevant one
        periods.push({
          type: PeriodType.OVERTIME,
          startTime: periodState.overtimeInfo.startTime,
          endTime: periodState.overtimeInfo.endTime,
          sequence: 3,
          isOvernight: this.isOvernightPeriod(
            periodState.overtimeInfo.startTime,
            periodState.overtimeInfo.endTime,
          ),
          isDayOff: periodState.overtimeInfo.isDayOffOvertime,
        });

        return periods; // Return only overtime period
      }
    }

    // Add regular shift
    periods.push({
      type: PeriodType.REGULAR,
      startTime: periodState.shift.startTime,
      endTime: periodState.shift.endTime,
      sequence: 2,
      isOvernight: this.isOvernightPeriod(
        periodState.shift.startTime,
        periodState.shift.endTime,
      ),
    });

    // Add evening overtime if exists
    if (
      periodState.overtimeInfo &&
      !this.isEarlyMorningOvertime(
        periodState.overtimeInfo.startTime,
        periodState.shift.startTime,
      )
    ) {
      periods.push({
        type: PeriodType.OVERTIME,
        startTime: periodState.overtimeInfo.startTime,
        endTime: periodState.overtimeInfo.endTime,
        sequence: 3,
        isOvernight: this.isOvernightPeriod(
          periodState.overtimeInfo.startTime,
          periodState.overtimeInfo.endTime,
        ),
        isDayOff: periodState.overtimeInfo.isDayOffOvertime,
      });
    }

    return this.sortPeriodsByChronologicalOrder(periods, now);
  }

  private findRelevantPeriod(
    periods: PeriodDefinition[],
    now: Date,
    lastCompletedPeriod?: { type: PeriodType; checkOutTime: Date } | null,
  ): PeriodDefinition | null {
    // 1. First check if we have a completed period
    if (lastCompletedPeriod) {
      const completedPeriodEnd = lastCompletedPeriod.checkOutTime;
      const nextPeriod = periods.find((period) => {
        const periodStart = this.parseTimeWithContext(period.startTime, now);
        return (
          period.type !== lastCompletedPeriod.type &&
          periodStart > completedPeriodEnd
        );
      });

      if (lastCompletedPeriod?.type === PeriodType.REGULAR) {
        const overtimePeriod = periods.find(
          (p) => p.type === PeriodType.OVERTIME,
        );
        if (overtimePeriod) {
          const overtimeStart = this.parseTimeWithContext(
            overtimePeriod.startTime,
            now,
          );
          // Even if not yet in approach window, return overtime period as next
          if (now <= overtimeStart) {
            return overtimePeriod;
          }
        }
      }

      // If we're in between completed period and next period, return next period
      if (nextPeriod) {
        const nextStart = this.parseTimeWithContext(nextPeriod.startTime, now);
        const approachWindow = subMinutes(nextStart, 30);
        if (now >= approachWindow) {
          return nextPeriod;
        }
        return null; // No valid period if we're not approaching next period
      }
    }

    // 2. Regular period checking
    for (const period of periods) {
      const periodStart = this.parseTimeWithContext(period.startTime, now);
      const periodEnd = this.parseTimeWithContext(period.endTime, now);
      const adjustedEnd =
        period.isOvernight && periodEnd < periodStart
          ? addDays(periodEnd, 1)
          : periodEnd;

      const approachWindow = subMinutes(periodStart, 30);
      if (now >= approachWindow && now <= adjustedEnd) {
        return period;
      }
    }

    // If no current period, get next upcoming one
    return (
      periods.find((period) => {
        const periodStart = this.parseTimeWithContext(period.startTime, now);
        return now < periodStart;
      }) || null
    );
  }

  private resolveActivePeriod(
    attendance: AttendanceRecord,
    periods: PeriodDefinition[],
    now: Date,
  ): UnifiedPeriodState {
    // Find the active period matching attendance type
    const activePeriod = periods.find(
      (period) => period.type === attendance.type,
    );
    if (!activePeriod) {
      return this.createDefaultPeriodState(now);
    }

    // Parse time with proper overnight handling
    const periodStart = this.parseTimeWithContext(activePeriod.startTime, now);
    let periodEnd = this.parseTimeWithContext(activePeriod.endTime, now);

    // Adjust end time for overnight periods
    if (activePeriod.isOvernight && periodEnd < periodStart) {
      periodEnd = addDays(periodEnd, 1);
    }

    return {
      type: activePeriod.type,
      timeWindow: {
        start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
      activity: {
        isActive: true,
        checkIn: format(
          new Date(attendance.CheckInTime!),
          "yyyy-MM-dd'T'HH:mm:ss.SSS",
        ),
        checkOut: null,
        isOvertime: activePeriod.type === PeriodType.OVERTIME,
        isDayOffOvertime: Boolean(activePeriod.isDayOff),
        isInsideShiftHours: activePeriod.type === PeriodType.REGULAR,
      },
      validation: {
        isWithinBounds: isWithinInterval(now, {
          start: periodStart,
          end: periodEnd,
        }),
        isEarly: now < periodStart,
        isLate: false, // Don't mark as late during active period
        isOvernight: activePeriod.isOvernight || false,
        isConnected: attendance.overtimeState === 'COMPLETED',
      },
    };
  }

  private createDefaultPeriodState(now: Date): UnifiedPeriodState {
    return {
      type: PeriodType.REGULAR,
      timeWindow: {
        start: format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
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

  private isEarlyMorningOvertime(
    overtimeStart: string,
    shiftStart: string,
  ): boolean {
    const [otHours, otMinutes] = overtimeStart.split(':').map(Number);
    const [shiftHours, shiftMinutes] = shiftStart.split(':').map(Number);

    return otHours * 60 + otMinutes < shiftHours * 60 + shiftMinutes;
  }

  private sortPeriodsByChronologicalOrder(
    periods: PeriodDefinition[],
    now: Date,
  ): PeriodDefinition[] {
    return periods.sort((a, b) => {
      const aTime = this.parseTimeWithContext(a.startTime, now);
      const bTime = this.parseTimeWithContext(b.startTime, now);
      return aTime.getTime() - bTime.getTime();
    });
  }

  // Helper method for time context parsing
  private parseTimeWithContext(timeString: string, referenceDate: Date) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const parsedTime = new Date(referenceDate);
    parsedTime.setHours(hours, minutes, 0, 0);
    return parsedTime;
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

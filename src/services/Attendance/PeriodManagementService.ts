import {
  PeriodTransition,
  ShiftWindowResponse,
  UnifiedPeriodState,
  AttendanceRecord,
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

    console.log('Period Resolution:', {
      currentTime: format(now, 'HH:mm:ss'),
      availablePeriods: periods.map((p) => ({
        type: p.type,
        start: p.startTime,
        end: p.endTime,
        sequence: p.sequence,
      })),
    });

    // Handle active attendance first
    if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
      return this.resolveActivePeriod(attendance, periods, now);
    }

    // Find relevant period (either current or upcoming)
    const relevantPeriod = this.findRelevantPeriod(periods, now);
    if (!relevantPeriod) {
      return this.createDefaultPeriodState(now);
    }

    // Create period state with proper time window
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
  ): PeriodDefinition | null {
    for (const period of periods) {
      const periodStart = this.parseTimeWithContext(period.startTime, now);
      const periodEnd = this.parseTimeWithContext(period.endTime, now);

      // Adjust end time for overnight periods
      const adjustedEnd =
        period.isOvernight && periodEnd < periodStart
          ? addDays(periodEnd, 1)
          : periodEnd;

      // If we're approaching the period (within 30 minutes) or inside it
      const approachWindow = subMinutes(periodStart, 30);
      if (now >= approachWindow && now <= adjustedEnd) {
        return period;
      }
    }

    // If no current period, get the next upcoming one
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
    const activePeriod = periods.find(
      (period) => period.type === attendance.type,
    );
    if (!activePeriod) {
      return this.createDefaultPeriodState(now);
    }

    return {
      type: activePeriod.type,
      timeWindow: {
        start: format(
          this.parseTimeWithContext(activePeriod.startTime, now),
          "yyyy-MM-dd'T'HH:mm:ss.SSS",
        ),
        end: format(
          this.parseTimeWithContext(activePeriod.endTime, now),
          "yyyy-MM-dd'T'HH:mm:ss.SSS",
        ),
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
        isWithinBounds: true,
        isEarly: false,
        isLate: false,
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

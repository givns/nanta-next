import {
  Period,
  PeriodWindow,
  PeriodTransition,
  DailyPeriods,
  ShiftWindowResponse,
  OvertimeContext,
  PeriodType,
  PeriodStatus,
} from '@/types/attendance';
import { ATTENDANCE_CONSTANTS } from '@/types/attendance/base';
import { getCurrentTime } from '@/utils/dateUtils';
import {
  parseISO,
  format,
  isWithinInterval,
  isAfter,
  subMinutes,
  addDays,
} from 'date-fns';

export class PeriodManagementService {
  // CORE PERIOD DETERMINATION
  determineCurrentPeriod(time: Date, periods: Period[]): Period | null {
    const validPeriods = this.sortAndValidatePeriods(periods);
    const overtimePeriods = validPeriods.filter((p) => p.isOvertime);
    const regularPeriods = validPeriods.filter((p) => !p.isOvertime);

    // Check overtime periods first
    for (const period of overtimePeriods) {
      const adjustedPeriod = this.adjustPeriodForOvernight(period, time);
      const earlyWindow = this.calculateEarlyWindow(adjustedPeriod.startTime);

      if (
        this.isTimeWithinPeriod(time, {
          start: earlyWindow,
          end: adjustedPeriod.endTime,
        })
      ) {
        return {
          ...period,
          status: this.determinePeriodStatus(time, {
            start: adjustedPeriod.startTime,
            end: adjustedPeriod.endTime,
          }),
        };
      }
    }

    // Then check regular periods
    for (const period of regularPeriods) {
      const adjustedPeriod = this.adjustPeriodForOvernight(period, time);
      if (
        this.isTimeWithinPeriod(time, {
          start: adjustedPeriod.startTime,
          end: adjustedPeriod.endTime,
        })
      ) {
        return {
          ...period,
          status: this.determinePeriodStatus(time, {
            start: adjustedPeriod.startTime,
            end: adjustedPeriod.endTime,
          }),
        };
      }
    }

    return null;
  }

  // PERIOD WINDOWS AND TRANSITIONS
  getDailyPeriods(periods: Period[]): DailyPeriods {
    const now = getCurrentTime();
    const validPeriods = this.sortAndValidatePeriods(periods);
    const periodWindows = validPeriods.map((p) => this.createPeriodWindow(p));

    return {
      date: format(now, 'yyyy-MM-dd'),
      periods: periodWindows,
      currentPeriodIndex: this.findCurrentPeriodIndex(periodWindows, now),
      hasCompletedPeriods: this.hasCompletedPeriods(periodWindows, now),
      hasIncompletePeriods: this.hasIncompletePeriods(periodWindows, now),
      hasFuturePeriods: this.hasFuturePeriods(periodWindows, now),
    };
  }

  calculateTransitions(periods: Period[]): PeriodTransition[] {
    const validPeriods = this.sortAndValidatePeriods(periods);
    const transitions: PeriodTransition[] = [];

    for (let i = 0; i < validPeriods.length - 1; i++) {
      const current = validPeriods[i];
      const next = validPeriods[i + 1];

      if (this.arePeriodsConnected(current, next)) {
        transitions.push(this.createTransition(i, current, next));
      }
    }

    return transitions;
  }

  // PERIOD CREATION AND CONVERSION
  createPeriodFromWindow(window: ShiftWindowResponse): Period {
    const now = getCurrentTime();
    return {
      type: window.type,
      startTime: parseISO(window.current.start),
      endTime: parseISO(window.current.end),
      isOvertime: window.type === PeriodType.OVERTIME,
      overtimeId: window.overtimeInfo?.id,
      isOvernight: this.isOvernightPeriod(window),
      isDayOffOvertime: window.overtimeInfo?.isDayOffOvertime,
      status: this.determineStatusFromWindow(window),
      isConnected: false,
    };
  }

  createOvertimePeriod(overtimeInfo: OvertimeContext, now: Date): Period {
    const start = this.parseWindowTime(overtimeInfo.startTime, now);
    const end = this.parseWindowTime(overtimeInfo.endTime, now);

    return {
      type: PeriodType.OVERTIME,
      startTime: start,
      endTime: end,
      isOvertime: true,
      overtimeId: overtimeInfo.id,
      isOvernight: overtimeInfo.endTime < overtimeInfo.startTime,
      isDayOffOvertime: overtimeInfo.isDayOffOvertime,
      status: this.determinePeriodStatus(now, { start: start, end: end }),
      isConnected: false,
    };
  }

  // STATUS DETERMINATION
  private determinePeriodStatus(
    time: Date,
    window: { start: Date; end: Date },
  ): PeriodStatus {
    if (isWithinInterval(time, window)) {
      return PeriodStatus.ACTIVE;
    }
    if (time < window.start) {
      return PeriodStatus.PENDING;
    }
    return PeriodStatus.COMPLETED;
  }

  private determineStatusFromWindow(window: ShiftWindowResponse): PeriodStatus {
    const now = getCurrentTime();
    const start = parseISO(window.current.start);
    const end = parseISO(window.current.end);

    return this.determinePeriodStatus(now, { start: start, end: end });
  }

  // UTILITY FUNCTIONS
  private createPeriodWindow(period: Period): PeriodWindow {
    const now = getCurrentTime();

    return {
      start: period.startTime,
      end: period.endTime,
      type: period.type,
      overtimeId: period.overtimeId,
      isConnected: period.isConnected || false,
      status:
        period.status ||
        this.determinePeriodStatus(now, {
          start: period.startTime,
          end: period.endTime,
        }),
      nextPeriod: undefined,
    };
  }

  private createTransition(
    index: number,
    current: Period,
    next: Period,
  ): PeriodTransition {
    return {
      from: {
        periodIndex: index,
        type: current.type,
      },
      to: {
        periodIndex: index + 1,
        type: next.type,
      },
      transitionTime: current.endTime.toISOString(),
      isComplete: current.status === PeriodStatus.COMPLETED,
    };
  }

  private sortAndValidatePeriods(periods: (Period | null)[]): Period[] {
    const validPeriods = periods
      .filter((p): p is Period => p !== null && this.isValidPeriod(p))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return validPeriods.map((period, index, array) => ({
      ...period,
      isConnected:
        index < array.length - 1
          ? this.arePeriodsConnected(period, array[index + 1])
          : false,
    }));
  }

  // HELPER FUNCTIONS
  private isValidPeriod(period: Period): boolean {
    return (
      period.startTime instanceof Date &&
      period.endTime instanceof Date &&
      period.type != null &&
      isAfter(period.endTime, period.startTime)
    );
  }

  private arePeriodsConnected(p1: Period, p2: Period): boolean {
    const diffMinutes = Math.abs(
      (p2.startTime.getTime() - p1.endTime.getTime()) / (1000 * 60),
    );
    return diffMinutes <= 30;
  }

  private adjustPeriodForOvernight(period: Period, currentDay: Date): Period {
    if (period.isOvernight && period.endTime < period.startTime) {
      return {
        ...period,
        endTime: addDays(period.endTime, 1),
      };
    }
    return period;
  }

  private isTimeWithinPeriod(
    time: Date,
    window: { start: Date; end: Date },
  ): boolean {
    return isWithinInterval(time, {
      start: window.start,
      end: window.end,
    });
  }

  private calculateEarlyWindow(startTime: Date): Date {
    return subMinutes(startTime, ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD);
  }

  private findCurrentPeriodIndex(windows: PeriodWindow[], now: Date): number {
    return windows.findIndex((w) => this.isTimeWithinPeriod(now, w));
  }

  private hasCompletedPeriods(windows: PeriodWindow[], now: Date): boolean {
    return windows.some((w) => isAfter(now, w.end));
  }

  private hasIncompletePeriods(windows: PeriodWindow[], now: Date): boolean {
    return windows.some((w) => !isAfter(now, w.end));
  }

  private hasFuturePeriods(windows: PeriodWindow[], now: Date): boolean {
    return windows.some((w) => isAfter(w.start, now));
  }

  private isOvernightPeriod(window: ShiftWindowResponse): boolean {
    return window.current.end < window.current.start;
  }

  private parseWindowTime(timeStr: string, date: Date): Date {
    return parseISO(`${format(date, 'yyyy-MM-dd')}T${timeStr}`);
  }
}

// services/Attendance/PeriodManagementService.ts

import {
  Period,
  PeriodWindow,
  PeriodTransition,
  DailyPeriods,
  AttendanceBaseResponse,
  ShiftWindowResponse,
  OvertimeContext,
  PeriodType,
} from '@/types/attendance';
import {
  parseISO,
  format,
  isWithinInterval,
  isAfter,
  subMinutes,
  addDays,
} from 'date-fns';
import { ATTENDANCE_CONSTANTS } from '@/types/attendance/base';
import { getCurrentTime } from '@/utils/dateUtils';
import { OvertimeState } from '@prisma/client';

export class PeriodManagementService {
  determineCurrentPeriod(
    time: Date,
    periods: Period[],
    currentDay: Date = time,
  ): Period | null {
    const sortedPeriods = [...periods].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    const overtimePeriods = sortedPeriods.filter((p) => p.isOvertime);
    const regularPeriods = sortedPeriods.filter((p) => !p.isOvertime);

    for (const period of overtimePeriods) {
      const adjustedPeriod = this.adjustPeriodForOvernight(period, currentDay);
      const earlyWindow = subMinutes(
        adjustedPeriod.startTime,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      );

      if (
        isWithinInterval(time, {
          start: earlyWindow,
          end: adjustedPeriod.endTime,
        })
      ) {
        return period;
      }
    }

    for (const period of regularPeriods) {
      const adjustedPeriod = this.adjustPeriodForOvernight(period, currentDay);
      if (
        isWithinInterval(time, {
          start: adjustedPeriod.startTime,
          end: adjustedPeriod.endTime,
        })
      ) {
        return period;
      }
    }

    return null;
  }

  determineEffectiveWindow(
    window: ShiftWindowResponse,
    baseStatus: AttendanceBaseResponse,
    now: Date,
    overtimeInfo?: OvertimeContext,
  ): { effectiveWindow: ShiftWindowResponse; effectivePeriod: Period | null } {
    let effectiveWindow = { ...window };
    let effectivePeriod = null;

    // Handle post-overtime transition
    if (this.isPostOvertimeTransition(baseStatus, window)) {
      const regularStart = this.parseWindowTime(
        window.nextPeriod!.startTime,
        now,
      );
      const regularEnd = this.parseWindowTime(window.shift.endTime, now);
      effectiveWindow = this.createRegularWindow(
        window,
        regularStart,
        regularEnd,
      );
      effectivePeriod = this.createRegularPeriod(regularStart, regularEnd);
    }
    // Handle regular to overtime transition
    else if (this.isInTransitionWindow(window, now, overtimeInfo)) {
      if (
        baseStatus.latestAttendance?.CheckInTime &&
        !baseStatus.latestAttendance.CheckOutTime
      ) {
        // Keep regular period during transition
        const regularStart = this.parseWindowTime(window.shift.startTime, now);
        const regularEnd = this.parseWindowTime(window.shift.endTime, now);
        effectiveWindow = this.createRegularWindow(
          window,
          regularStart,
          regularEnd,
        );
        effectivePeriod = this.createRegularPeriod(regularStart, regularEnd);

        // Add transition metadata
        effectiveWindow.transition = {
          from: {
            type: PeriodType.REGULAR,
            end: regularEnd.toISOString(),
          },
          to: {
            type: PeriodType.OVERTIME,
            start: overtimeInfo
              ? this.parseWindowTime(overtimeInfo.startTime, now).toISOString()
              : null,
          },
          isInTransition: true,
        };
      }
    } else if (this.isEarlyOvertimeTransition(window, now)) {
      // Use passed overtimeInfo if available, otherwise fall back to window
      const currentOvertimeInfo =
        overtimeInfo || window.nextPeriod?.overtimeInfo;
      if (currentOvertimeInfo) {
        const overtimeStart = this.parseWindowTime(
          currentOvertimeInfo.startTime,
          now,
        );
        const overtimeEnd = this.parseWindowTime(
          currentOvertimeInfo.endTime,
          now,
        );
        effectiveWindow = this.createOvertimeWindow(
          window,
          currentOvertimeInfo,
          overtimeStart,
          overtimeEnd,
        );
        effectivePeriod = this.createOvertimePeriod(currentOvertimeInfo, now);
      }
    }

    return { effectiveWindow, effectivePeriod };
  }

  private isInTransitionWindow(
    window: ShiftWindowResponse,
    now: Date,
    overtimeInfo?: OvertimeContext,
  ): boolean {
    if (!overtimeInfo) return false;

    const overtimeStart = this.parseWindowTime(overtimeInfo.startTime, now);
    const transitionStart = subMinutes(overtimeStart, 30);

    return isWithinInterval(now, {
      start: transitionStart,
      end: overtimeStart,
    });
  }

  createPeriodFromWindow(window: ShiftWindowResponse): Period {
    return {
      type: window.type,
      startTime: parseISO(window.current.start),
      endTime: parseISO(window.current.end),
      isOvertime: window.type === PeriodType.OVERTIME,
      overtimeId: window.overtimeInfo?.id,
      isOvernight: this.isOvernightPeriod(window),
      isDayOffOvertime: window.overtimeInfo?.isDayOffOvertime,
    };
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

  getDailyPeriods(periods: Period[]): DailyPeriods {
    const now = getCurrentTime();
    const sortedPeriods = this.sortAndValidatePeriods(periods);
    const periodWindows = sortedPeriods.map((p) =>
      this.convertToPeriodWindow(p),
    );

    return {
      date: format(now, 'yyyy-MM-dd'),
      periods: periodWindows,
      currentPeriodIndex: periodWindows.findIndex((p) =>
        this.isWithinPeriod(now, p),
      ),
      hasCompletedPeriods: periodWindows.some((p) => isAfter(now, p.end)),
      hasIncompletePeriods: periodWindows.some((p) => !isAfter(now, p.end)),
      hasFuturePeriods: periodWindows.some((p) => isAfter(p.start, now)),
    };
  }

  calculateTransitions(periods: Period[]): PeriodTransition[] {
    const transitions: PeriodTransition[] = [];

    for (let i = 0; i < periods.length - 1; i++) {
      const current = periods[i];
      const next = periods[i + 1];

      if (current.isConnected) {
        transitions.push({
          from: {
            periodIndex: i,
            type: current.type,
          },
          to: {
            periodIndex: i + 1,
            type: next.type,
          },
          transitionTime: current.endTime.toISOString(),
          isComplete: false,
        });
      }
    }

    return transitions;
  }

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

  isWithinPeriod(date: Date, period: PeriodWindow): boolean {
    return isWithinInterval(date, {
      start: period.start,
      end: period.end,
    });
  }

  private isPostOvertimeTransition(
    baseStatus: AttendanceBaseResponse,
    window: ShiftWindowResponse,
  ): boolean {
    return (
      baseStatus?.latestAttendance?.overtimeState === OvertimeState.COMPLETED &&
      window.nextPeriod?.type === PeriodType.REGULAR
    );
  }

  private isEarlyOvertimeTransition(
    window: ShiftWindowResponse,
    now: Date,
  ): boolean {
    if (!window.nextPeriod?.overtimeInfo) return false;

    const overtimeStart = this.parseWindowTime(
      window.nextPeriod.overtimeInfo.startTime,
      now,
    );
    const earlyWindow = subMinutes(
      overtimeStart,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
    );

    return isAfter(now, earlyWindow);
  }

  private isOvernightPeriod(window: ShiftWindowResponse): boolean {
    return window.current.end < window.current.start;
  }

  private convertToPeriodWindow(period: Period): PeriodWindow {
    return {
      start: period.startTime,
      end: period.endTime,
      type: period.type,
      overtimeId: period.overtimeId,
      isConnected: period.isConnected || false,
    };
  }

  private createRegularWindow(
    window: ShiftWindowResponse,
    start: Date,
    end: Date,
  ): ShiftWindowResponse {
    return {
      ...window,
      type: PeriodType.REGULAR,
      current: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      nextPeriod: null,
      overtimeInfo: undefined,
    };
  }

  private createOvertimeWindow(
    window: ShiftWindowResponse,
    overtimeInfo: OvertimeContext,
    start: Date,
    end: Date,
  ): ShiftWindowResponse {
    return {
      ...window,
      type: PeriodType.OVERTIME,
      current: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      overtimeInfo: {
        ...overtimeInfo,
        startTime: format(start, 'HH:mm'),
        endTime: format(end, 'HH:mm'),
      },
      nextPeriod: null,
    };
  }

  private createRegularPeriod(start: Date, end: Date): Period {
    return {
      type: PeriodType.REGULAR,
      startTime: start,
      endTime: end,
      isOvertime: false,
      isOvernight: false,
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
    };
  }

  // Update to handle Array filtering properly
  sortAndValidatePeriods(periods: (Period | null)[]): Period[] {
    const validPeriods = periods
      .filter((p): p is Period => p !== null && this.isValidPeriod(p))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Check for connections between periods
    for (let i = 0; i < validPeriods.length - 1; i++) {
      validPeriods[i].isConnected = this.arePeriodsConnected(
        validPeriods[i],
        validPeriods[i + 1],
      );
    }

    return validPeriods;
  }

  private parseWindowTime(timeStr: string, date: Date): Date {
    return parseISO(`${format(date, 'yyyy-MM-dd')}T${timeStr}`);
  }
}

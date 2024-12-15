// services/Attendance/PeriodManagementService.ts
import { Period } from '@/types/attendance/period';
import { addDays, subMinutes, isWithinInterval } from 'date-fns';
import { ATTENDANCE_CONSTANTS } from '@/types/attendance/base';

export class PeriodManagementService {
  determineCurrentPeriod(
    time: Date,
    periods: Period[],
    currentDay: Date = time,
  ): Period | null {
    // Sort and split periods by type
    const sortedPeriods = [...periods].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    const overtimePeriods = sortedPeriods.filter((p) => p.isOvertime);
    const regularPeriods = sortedPeriods.filter((p) => !p.isOvertime);

    // Process overtime periods first
    for (const period of overtimePeriods) {
      const adjustedPeriod = this.adjustPeriodForOvernight(period, currentDay);
      const earlyWindow = ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD;
      const effectiveStartTime = subMinutes(
        adjustedPeriod.startTime,
        earlyWindow,
      );

      if (
        isWithinInterval(time, {
          start: effectiveStartTime,
          end: adjustedPeriod.endTime,
        })
      ) {
        return period;
      }
    }

    // Then check regular periods
    for (const period of regularPeriods) {
      const adjustedPeriod = this.adjustPeriodForOvernight(period, currentDay);
      const earlyWindow = ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD;
      const effectiveStartTime = subMinutes(
        adjustedPeriod.startTime,
        earlyWindow,
      );

      if (
        isWithinInterval(time, {
          start: effectiveStartTime,
          end: adjustedPeriod.endTime,
        })
      ) {
        return period;
      }
    }

    return null;
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

  getNextPeriod(time: Date, periods: Period[]): Period | null {
    const sortedPeriods = [...periods].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );
    return sortedPeriods.find((period) => period.startTime > time) || null;
  }
}

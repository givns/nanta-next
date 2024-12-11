// services/Attendance/PeriodManagementService.ts
import { Period } from '@/types/attendance/period';
import { addDays, subMinutes, isWithinInterval } from 'date-fns';
import { ATTENDANCE_CONSTANTS } from '@/types/attendance/base';

export class PeriodManagementService {
  determineCurrentPeriod(time: Date, periods: Period[]): Period | null {
    // Sort periods by start time
    const sortedPeriods = [...periods].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    // Handle overnight periods
    const adjustedPeriods = sortedPeriods.map((period) => {
      if (period.isOvernight && period.endTime < period.startTime) {
        return {
          ...period,
          endTime: addDays(period.endTime, 1),
        };
      }
      return period;
    });

    // Find current period with early window consideration
    for (const period of adjustedPeriods) {
      const earlyWindow = period.isOvertime
        ? ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD
        : ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD;

      const effectiveStartTime = subMinutes(period.startTime, earlyWindow);

      if (
        isWithinInterval(time, {
          start: effectiveStartTime,
          end: period.endTime,
        })
      ) {
        return period;
      }
    }

    return null;
  }

  getNextPeriod(time: Date, periods: Period[]): Period | null {
    const sortedPeriods = [...periods].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    return sortedPeriods.find((period) => period.startTime > time) || null;
  }
}

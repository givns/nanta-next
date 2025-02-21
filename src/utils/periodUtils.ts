import { PeriodDefinition, UnifiedPeriodState } from '@/types/attendance';
import { PeriodType } from '@prisma/client';
import { addDays, format, parseISO } from 'date-fns';

export function determinePeriodAtTime(
  periods: PeriodDefinition[],
  currentTime: Date,
): PeriodDefinition | null {
  // Sort periods by sequence
  const sortedPeriods = periods.sort((a, b) => a.sequence - b.sequence);

  // Helper function to parse time with current date context
  const parseTimeWithContext = (timeString: string, referenceDate: Date) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const parsedTime = new Date(referenceDate);
    parsedTime.setHours(hours, minutes, 0, 0);
    return parsedTime;
  };

  // Find current period
  for (const period of sortedPeriods) {
    const periodStart = parseTimeWithContext(period.startTime, currentTime);
    const periodEnd = parseTimeWithContext(period.endTime, currentTime);

    // Adjust for overnight periods
    if (period.isOvernight && periodEnd < periodStart) {
      periodEnd.setDate(periodEnd.getDate() + 1);
    }

    // Check if current time is within period
    if (currentTime >= periodStart && currentTime <= periodEnd) {
      return period;
    }
  }

  // If no current period, find next upcoming period
  const upcomingPeriod = sortedPeriods.find((period) => {
    const periodStart = parseTimeWithContext(period.startTime, currentTime);
    return periodStart > currentTime;
  });

  return upcomingPeriod || null;
}

// Additional helper to convert PeriodDefinition to UnifiedPeriodState
export function convertPeriodToUnifiedState(
  period: PeriodDefinition,
  now: Date,
  additionalInfo?: {
    isDayOffOvertime?: boolean;
    hasOvertimeInfo?: boolean;
  },
): UnifiedPeriodState {
  const periodStart = parseISO(
    `${format(now, 'yyyy-MM-dd')}T${period.startTime}`,
  );
  const periodEnd = period.isOvernight
    ? parseISO(`${format(addDays(now, 1), 'yyyy-MM-dd')}T${period.endTime}`)
    : parseISO(`${format(now, 'yyyy-MM-dd')}T${period.endTime}`);

  return {
    type: period.type,
    timeWindow: {
      start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
    },
    activity: {
      isActive: false,
      checkIn: null,
      checkOut: null,
      isOvertime: period.type === PeriodType.OVERTIME,
      isDayOffOvertime: additionalInfo?.isDayOffOvertime || false,
      isInsideShiftHours: period.type === PeriodType.REGULAR,
    },
    validation: {
      isWithinBounds: true,
      isEarly: now < periodStart,
      isLate: now > periodEnd,
      isOvernight: period.isOvernight || false,
      isConnected: additionalInfo?.hasOvertimeInfo || false,
    },
  };
}

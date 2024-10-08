import {
  addMonths,
  format,
  startOfYear,
  endOfMonth,
  subMonths,
} from 'date-fns';

export interface PayrollPeriod {
  label: string;
  value: string;
  start: string;
  end: string;
}

export function generatePayrollPeriods(
  currentDate = new Date(),
): PayrollPeriod[] {
  const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
  const periods: PayrollPeriod[] = [];

  let startDate = startOfYear(currentDate);
  startDate = subMonths(startDate, 1); // Start from December of previous year
  startDate.setDate(26);

  while (startDate <= currentDate) {
    const endDate = endOfMonth(addMonths(startDate, 1));
    endDate.setDate(25);

    const periodLabel = format(addMonths(startDate, 1), 'MMMM yyyy');
    const period: PayrollPeriod = {
      label: periodLabel,
      value: periodLabel.toLowerCase().replace(' ', '-'),
      start: formatDate(startDate),
      end: formatDate(endDate),
    };

    periods.push(period);

    startDate = addMonths(startDate, 1);
  }

  // Add "Current" period
  const currentPeriod = periods[periods.length - 1];
  periods.push({
    label: 'Current',
    value: 'current',
    start: currentPeriod.start,
    end: currentPeriod.end,
  });

  return periods;
}

export function getCurrentPayrollPeriod(
  currentDate = new Date(),
): PayrollPeriod {
  const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const day = currentDate.getDate();

  let startDate: Date;
  let endDate: Date;

  if (day < 26) {
    // Current period started last month
    startDate = new Date(year, month - 1, 26);
    endDate = new Date(year, month, 25);
  } else {
    // Current period starts this month
    startDate = new Date(year, month, 26);
    endDate = new Date(year, month + 1, 25);
  }

  // Ensure end date is valid (handle cases where next month has fewer days)
  endDate = endOfMonth(endDate) < endDate ? endOfMonth(endDate) : endDate;

  return {
    label: 'Current',
    value: 'current', // Add the missing 'value' property
    start: formatDate(startDate),
    end: formatDate(endDate),
  };
}

export function isCurrentPeriod(period: PayrollPeriod): boolean {
  const currentPeriod = getCurrentPayrollPeriod();
  return (
    period.start === currentPeriod.start && period.end === currentPeriod.end
  );
}

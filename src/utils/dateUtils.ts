// utils/dateUtils.ts
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export const formatDate = (date: string | Date): string => {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return format(parsedDate, 'yyyy-MM-dd HH:mm:ss');
};

export function zonedTimeToUtc(date: Date | number, timeZone: string): Date {
  const zonedDate = toZonedTime(date, timeZone);
  return new Date(zonedDate.getTime() - zonedDate.getTimezoneOffset() * 60000);
}

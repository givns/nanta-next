// utils/dateUtils.ts
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export function formatDate(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return format(parsedDate, 'yyyy-MM-dd');
}

export function formatTime(time: string | Date): string {
  const parsedTime =
    typeof time === 'string' ? parseISO(`1970-01-01T${time}`) : time;
  return format(parsedTime, 'HH:mm');
}

export function zonedTimeToUtc(date: Date | number, timeZone: string): Date {
  const zonedDate = toZonedTime(date, timeZone);
  return new Date(zonedDate.getTime() - zonedDate.getTimezoneOffset() * 60000);
}

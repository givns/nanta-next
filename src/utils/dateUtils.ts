// utils/dateUtils.ts
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Asia/Bangkok';

export function formatDate(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return format(toZonedTime(parsedDate, TIMEZONE), 'yyyy-MM-dd');
}

export function formatTime(time: string | Date): string {
  const parsedTime =
    typeof time === 'string' ? parseISO(`1970-01-01T${time}`) : time;
  return format(toZonedTime(parsedTime, TIMEZONE), 'HH:mm');
}

export function getBangkokTime(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

export function formatBangkokTime(date: Date, formatStr: string): string {
  return format(toZonedTime(date, TIMEZONE), formatStr);
}

export function isBangkokTimeWithinRange(
  time: Date,
  start: string,
  end: string,
): boolean {
  const bangkokTime = toZonedTime(time, TIMEZONE);
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  const startTime = new Date(bangkokTime).setHours(
    startHour,
    startMinute,
    0,
    0,
  );
  const endTime = new Date(bangkokTime).setHours(endHour, endMinute, 0, 0);

  return bangkokTime >= new Date(startTime) && bangkokTime <= new Date(endTime);
}

export function calculateTimeDifference(start: Date, end: Date): number {
  const bangkokStart = toZonedTime(start, TIMEZONE);
  const bangkokEnd = toZonedTime(end, TIMEZONE);
  return differenceInMinutes(bangkokEnd, bangkokStart);
}

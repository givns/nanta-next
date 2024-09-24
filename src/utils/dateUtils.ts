import { format, parseISO, differenceInMinutes, isValid } from 'date-fns';
import { toZonedTime, format as formatTz } from 'date-fns-tz';

const TIMEZONE = 'Asia/Bangkok';

export function formatDate(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsedDate)) {
    console.error('Invalid date:', date);
    return 'Invalid Date';
  }
  return formatTz(toZonedTime(parsedDate, TIMEZONE), 'yyyy-MM-dd', {
    timeZone: TIMEZONE,
  });
}

export function formatTime(time: string | Date): string {
  const parsedTime = typeof time === 'string' ? parseISO(time) : time;
  if (!isValid(parsedTime)) {
    console.error('Invalid time:', time);
    return 'Invalid Time';
  }
  return formatTz(toZonedTime(parsedTime, TIMEZONE), 'HH:mm:ss', {
    timeZone: TIMEZONE,
  });
}

export function getBangkokTime(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

export function formatBangkokTime(date: Date, formatStr: string): string {
  if (!isValid(date)) {
    console.error('Invalid date:', date);
    return 'Invalid Date';
  }
  return formatTz(toZonedTime(date, TIMEZONE), formatStr, {
    timeZone: TIMEZONE,
  });
}

export function isBangkokTimeWithinRange(
  time: Date,
  start: string,
  end: string,
): boolean {
  if (!isValid(time)) {
    console.error('Invalid time:', time);
    return false;
  }
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
  if (!isValid(start) || !isValid(end)) {
    console.error('Invalid date range:', start, end);
    return 0;
  }
  const bangkokStart = toZonedTime(start, TIMEZONE);
  const bangkokEnd = toZonedTime(end, TIMEZONE);
  return differenceInMinutes(bangkokEnd, bangkokStart);
}

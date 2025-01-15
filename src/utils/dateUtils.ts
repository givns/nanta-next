import { format, parseISO, differenceInMinutes, isValid } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Asia/Bangkok';

export function getBangkokTime(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

export function formatBangkokTime(
  date: Date | string | number,
  formatStr: string,
): string {
  const parsedDate = ensureDate(date);
  if (!parsedDate) return 'Invalid Date';
  const bangkokTime = toZonedTime(parsedDate, TIMEZONE);
  return format(bangkokTime, formatStr);
}

export function toBangkokTime(date: Date | string | number): Date {
  const parsedDate = ensureDate(date);
  if (!parsedDate) throw new Error('Invalid date provided');
  return toZonedTime(parsedDate, TIMEZONE);
}

//export function getCurrentTime(): Date {
//return getBangkokTime();
//}

export function getCurrentTime(): Date {
  //For testing specific scenarios
  const [datePart, timePart] = '2024-12-18T04:25'.split('T');
  const time = timePart.split('+')[0];
  return parseISO(`${datePart}T${time}`);
}

export function formatDateTime(
  date: Date | string | number,
  formatStr: string,
): string {
  const parsedDate = ensureDate(date);
  if (!parsedDate) return 'Invalid Date';
  return format(parsedDate, formatStr);
}

export function formatDate(date: Date | string | number): string {
  const parsedDate = ensureDate(date);
  if (!parsedDate) return 'Invalid Date';
  return format(parsedDate, 'yyyy-MM-dd');
}

export function formatTime(time: Date | string | number): string {
  if (typeof time === 'string') {
    // Try to parse the string as a time
    const [hours, minutes, seconds] = time.split(':').map(Number);
    if (
      isNaN(hours) ||
      isNaN(minutes) ||
      (seconds !== undefined && isNaN(seconds))
    ) {
      return 'Invalid Time';
    }
    // Create a new date object with the parsed time
    const parsedTime = new Date();
    parsedTime.setHours(hours, minutes, seconds || 0);
    return format(parsedTime, 'HH:mm:ss');
  }
  const parsedTime = ensureDate(time);
  if (!parsedTime) return 'Invalid Time';
  return format(parsedTime, 'HH:mm:ss');
}

export function isTimeWithinRange(
  time: Date | string | number,
  start: string,
  end: string,
): boolean {
  const parsedTime = ensureDate(time);
  if (!parsedTime) return false;

  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  const startTime = new Date(parsedTime).setHours(startHour, startMinute, 0, 0);
  const endTime = new Date(parsedTime).setHours(endHour, endMinute, 0, 0);

  return parsedTime >= new Date(startTime) && parsedTime <= new Date(endTime);
}

export function calculateTimeDifference(
  start: Date | string | number,
  end: Date | string | number,
): number {
  const parsedStart = ensureDate(start);
  const parsedEnd = ensureDate(end);
  if (!parsedStart || !parsedEnd) throw new Error('Invalid date provided');
  return differenceInMinutes(parsedEnd, parsedStart);
}

function ensureDate(date: Date | string | number): Date | null {
  if (date instanceof Date) {
    return isValid(date) ? date : null;
  }
  if (typeof date === 'string') {
    const parsed = parseISO(date);
    return isValid(parsed) ? parsed : null;
  }
  if (typeof date === 'number') {
    const parsed = new Date(date);
    return isValid(parsed) ? parsed : null;
  }
  return null;
}

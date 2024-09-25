import { format, parseISO, differenceInMinutes } from 'date-fns';

export function getCurrentTime(): Date {
  return new Date();
}

export function formatDateTime(date: Date, formatStr: string): string {
  return format(date, formatStr);
}

export function formatDate(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return format(parsedDate, 'yyyy-MM-dd');
}

export function formatTime(time: string | Date): string {
  const parsedTime = typeof time === 'string' ? parseISO(time) : time;
  return format(parsedTime, 'HH:mm:ss');
}

export function isTimeWithinRange(
  time: Date,
  start: string,
  end: string,
): boolean {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  const startTime = new Date(time).setHours(startHour, startMinute, 0, 0);
  const endTime = new Date(time).setHours(endHour, endMinute, 0, 0);

  return time >= new Date(startTime) && time <= new Date(endTime);
}

export function calculateTimeDifference(start: Date, end: Date): number {
  return differenceInMinutes(end, start);
}

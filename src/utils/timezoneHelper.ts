import moment from 'moment-timezone';

export const TIMEZONE = 'Asia/Bangkok';

export function convertToLocalTime(date: Date | string): moment.Moment {
  return moment.tz(date, TIMEZONE);
}

export function formatForDisplay(date: Date | string): string {
  return convertToLocalTime(date).format('YYYY-MM-DD HH:mm:ss');
}

export function parseFromLocal(
  dateString: string,
  format: string,
): moment.Moment {
  return moment.tz(dateString, format, TIMEZONE);
}

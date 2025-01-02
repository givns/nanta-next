// utils/timeUtils.ts
import { addHours, format, parseISO } from 'date-fns';

const TIMEZONE = 'Asia/Bangkok';

export const ensureDate = (
  time: Date | string | null | undefined,
): Date | null => {
  if (!time) return null;

  try {
    if (time instanceof Date) return time;

    // If it's a time string like "HH:mm"
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      const [hours, minutes] = time.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date;
    }

    // If it's an ISO string
    if (time.includes('T')) {
      return parseISO(time);
    }

    return null;
  } catch (error) {
    console.error('Error ensuring date:', error);
    return null;
  }
};

export const formatTimeDisplay = (
  time: Date | string | null | undefined,
): string => {
  if (!time) return '--:--';

  try {
    const date = ensureDate(time);
    if (!date) return '--:--';
    return format(date, 'HH:mm');
  } catch (error) {
    console.error('Error formatting time:', error);
    return '--:--';
  }
};

const isISOString = (str: string): boolean => {
  try {
    return str.includes('T') && !isNaN(Date.parse(str));
  } catch {
    return false;
  }
};

const isTimeString = (str: string): boolean => {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(str);
};

export const formatSafeTime = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '--:--';

  try {
    // If it's already in HH:mm format, return as is
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
      return timeStr;
    }

    // For ISO strings
    if (timeStr.includes('T')) {
      let date = parseISO(timeStr);
      // If the time is in UTC (has Z), add 7 hours for +07:00
      if (timeStr.includes('Z')) {
        date = addHours(date, 7);
      }
      return format(date, 'HH:mm');
    }

    return '--:--';
  } catch (error) {
    console.error('Time format error:', error);
    return '--:--';
  }
};

export const parseToLocalTime = (
  dateStr: string | null | undefined,
): Date | null => {
  if (!dateStr) return null;
  try {
    const date = parseISO(dateStr);
    // If the date is in UTC (has Z), add 7 hours
    return dateStr.includes('Z') ? addHours(date, 7) : date;
  } catch (error) {
    console.error('Parse to local time error:', { input: dateStr, error });
    return null;
  }
};

export const normalizeTimeString = (timeStr: string): string => {
  if (!timeStr) return timeStr;

  // If already has timezone, return as is
  if (timeStr.includes('+') || timeStr.includes('Z')) {
    return timeStr;
  }

  return `${timeStr}+07:00`;
};

// Update this function to handle timezone correctly
export const parseAndFormatISO = (
  dateStr: string | null | undefined,
): Date | null => {
  if (!dateStr) return null;
  try {
    if (isISOString(dateStr)) {
      return parseToLocalTime(dateStr);
    }
    return null;
  } catch (error) {
    console.error('Date parsing error:', error);
    return null;
  }
};
function zonedTimeToUtc(utcDate: Date, TIMEZONE: any): Date | null {
  throw new Error('Function not implemented.');
}

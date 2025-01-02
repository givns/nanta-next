// utils/timeUtils.ts
import { format, parseISO } from 'date-fns';

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

export const parseToLocalTime = (
  dateStr: string | null | undefined,
): Date | null => {
  if (!dateStr) return null;

  try {
    // For dates that already include timezone
    if (dateStr.includes('+07:00')) {
      // Remove timezone and parse as local time
      const localDate = dateStr.replace('+07:00', '');
      return parseISO(localDate);
    }

    // For UTC dates (with Z)
    if (dateStr.includes('Z')) {
      const utcDate = parseISO(dateStr);
      return zonedTimeToUtc(utcDate, TIMEZONE);
    }

    // For dates without timezone, treat as local
    return parseISO(dateStr);
  } catch (error) {
    console.error('Parse to local time error:', {
      input: dateStr,
      error,
    });
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

export const formatSafeTime = (
  timeStr: string | Date | null | undefined,
): string => {
  if (!timeStr) return '--:--';

  try {
    // Handle Date objects
    if (timeStr instanceof Date) {
      return format(timeStr, 'HH:mm');
    }

    // Handle ISO strings
    if (isISOString(timeStr)) {
      const parsedDate = parseToLocalTime(timeStr);
      if (!parsedDate) return '--:--';
      return format(parsedDate, 'HH:mm');
    }

    // Handle HH:mm format
    if (isTimeString(timeStr)) {
      return timeStr;
    }

    console.warn('Invalid time format:', timeStr);
    return '--:--';
  } catch (error) {
    console.error('Time format error:', error);
    return '--:--';
  }
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

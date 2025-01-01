// utils/timeUtils.ts
import { addHours, format, parseISO } from 'date-fns';

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

export const normalizeTimeString = (timeStr: string): string => {
  // If the string already has timezone info, return as is
  if (timeStr.includes('+') || timeStr.includes('Z')) {
    return timeStr;
  }
  // For local time strings without timezone, treat as local time
  return `${timeStr}+07:00`;
};

export const parseToLocalTime = (
  dateStr: string | null | undefined,
): Date | null => {
  if (!dateStr) return null;
  try {
    // If it's already has timezone info, parse it directly
    if (dateStr.includes('+') || dateStr.includes('Z')) {
      const parsedDate = parseISO(dateStr);
      // Add 7 hours to get back to local time
      return addHours(parsedDate, 7);
    }

    // If no timezone info, parse as local time
    return parseISO(dateStr);
  } catch (error) {
    console.error('Parse to local time error:', error);
    return null;
  }
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

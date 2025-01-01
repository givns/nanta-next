// shared/timeUtils.ts

import { format, parseISO } from 'date-fns';

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
      return format(parseISO(timeStr), 'HH:mm');
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

export const parseAndFormatISO = (
  dateStr: string | null | undefined,
): Date | null => {
  if (!dateStr) return null;
  try {
    if (isISOString(dateStr)) {
      return parseISO(dateStr);
    }
    return null;
  } catch (error) {
    console.error('Date parsing error:', error);
    return null;
  }
};

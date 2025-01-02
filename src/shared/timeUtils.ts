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

export const formatSafeTime = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '--:--';

  try {
    // If it's already in HH:mm format, return as is
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
      return timeStr;
    }

    // For ISO strings with timezone info
    const date = parseISO(timeStr);

    // Just take the hours and minutes directly without conversion
    const formatted = format(date, 'HH:mm');

    console.log('formatSafeTime processing:', {
      input: timeStr,
      formattedTime: formatted,
    });

    return formatted;
  } catch (error) {
    console.error('Time format error:', error);
    return '--:--';
  }
};

// For normalized times
export const normalizeTimeString = (timeStr: string): string => {
  if (!timeStr) return timeStr;

  try {
    // Debug input
    console.log('Normalizing time:', timeStr);

    // Add +07:00 for local times
    return `${timeStr}+07:00`;
  } catch (error) {
    console.error('Normalization error:', error);
    return timeStr;
  }
};

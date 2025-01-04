// utils/timeUtils.ts
import { format, parseISO } from 'date-fns';

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

export const formatSafeTime = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '--:--';

  try {
    // Case 1: Already in HH:mm format
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
      return timeStr;
    }

    // Case 2: ISO string with UTC marker (Z)
    if (timeStr.includes('Z')) {
      // Add 7 hours for Thailand timezone
      const date = new Date(timeStr);
      date.setHours(date.getHours() + 7);
      return date.toTimeString().slice(0, 5);
    }

    // Case 3: ISO string with T separator but no timezone
    if (timeStr.includes('T')) {
      return timeStr.split('T')[1].slice(0, 5);
    }

    // Case 4: Unknown format, try to extract time
    console.warn('Unknown time format:', timeStr);
    return '--:--';
  } catch (error) {
    console.error('Time format error:', error, {
      input: timeStr,
    });
    return '--:--';
  }
};

// Helper to normalize ISO strings to local time
export const normalizeTimeString = (timeStr: string): string => {
  if (!timeStr) return timeStr;

  try {
    // If already has timezone marker, convert to local
    if (timeStr.includes('Z')) {
      const date = new Date(timeStr);
      date.setHours(date.getHours() + 7);
      return date.toISOString().slice(0, 19); // Remove milliseconds and Z
    }

    // If no timezone marker, assume local time
    return timeStr;
  } catch (error) {
    console.error('Normalization error:', error);
    return timeStr;
  }
};

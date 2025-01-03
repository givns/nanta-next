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
    // If it's already in HH:mm format, return as is
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
      return timeStr;
    }

    // For ISO strings, extract hours and minutes directly
    if (timeStr.includes('T')) {
      // Extract time part after T: "2024-12-17T09:00:24.138Z" -> "09:00:24.138Z"
      const timePart = timeStr.split('T')[1];
      // Extract hours and minutes: "09:00:24.138Z" -> "09:00"
      const [hours, minutes] = timePart.split(':');

      console.log('formatSafeTime processing:', {
        input: timeStr,
        timePart,
        hours,
        minutes,
      });

      return `${hours}:${minutes}`;
    }

    return '--:--';
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

// utils/timeUtils.ts

import { format } from 'date-fns';
import { th } from 'date-fns/locale/th';

export function isWithinAllowedTimeRange(
  checkTime: Date,
  shiftStart: Date,
  shiftEnd: Date,
  allowedMinutesBefore: number = 30,
  allowedMinutesAfter: number = 30,
): boolean {
  const earliestAllowed = new Date(
    shiftStart.getTime() - allowedMinutesBefore * 60000,
  );
  const latestAllowed = new Date(
    shiftEnd.getTime() + allowedMinutesAfter * 60000,
  );

  return checkTime >= earliestAllowed && checkTime <= latestAllowed;
}
export const formatCheckTime = (date: Date | string): string => {
  const checkTime = typeof date === 'string' ? new Date(date) : date;
  return format(checkTime, 'HH:mm', { locale: th });
};

export const formatNotificationTime = (date: Date | string): string => {
  const checkTime = typeof date === 'string' ? new Date(date) : date;
  return format(checkTime, 'd MMMM yyyy เวลา HH:mm น.', { locale: th });
};

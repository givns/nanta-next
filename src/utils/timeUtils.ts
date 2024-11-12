// utils/timeUtils.ts

import { format } from 'date-fns';
import { th } from 'date-fns/locale/th';
import { AttendanceTime, ShiftInfo } from '@/types/attendance';

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

// utils/timeUtils.ts
export const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;

export function isValidTimeString(time: string | null | undefined): boolean {
  if (!time) return false;
  return TIME_REGEX.test(time);
}

export function formatTimeString(
  time: string | null | undefined,
): string | null {
  if (!time) return null;

  try {
    if (!isValidTimeString(time)) return null;

    const [hours, minutes] = time.split(':').map(Number);

    if (
      isNaN(hours) ||
      isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  } catch {
    return null;
  }
}

export function validateAttendanceTime(attendance: any): AttendanceTime | null {
  if (!attendance) return null;

  try {
    const validatedTime: AttendanceTime = {
      id: attendance.id || '',
      regularCheckInTime: formatTimeString(attendance.regularCheckInTime),
      regularCheckOutTime: formatTimeString(attendance.regularCheckOutTime),
      isLateCheckIn: !!attendance.isLateCheckIn,
      isLateCheckOut: !!attendance.isLateCheckOut,
      isEarlyCheckIn: !!attendance.isEarlyCheckIn,
      isVeryLateCheckOut: !!attendance.isVeryLateCheckOut,
      lateCheckOutMinutes: Number(attendance.lateCheckOutMinutes) || 0,
      status: attendance.status || '',
    };

    return validatedTime;
  } catch {
    return null;
  }
}

export function validateShiftInfo(shift: any): ShiftInfo | null {
  if (!shift) return null;

  try {
    const validatedShift: ShiftInfo = {
      name: shift.name || '',
      startTime: formatTimeString(shift.startTime) || '00:00',
      endTime: formatTimeString(shift.endTime) || '00:00',
    };

    return validatedShift;
  } catch {
    return null;
  }
}

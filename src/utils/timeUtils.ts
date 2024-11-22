// utils/timeUtils.ts

import { ShiftData } from '@/types/attendance';
import { DailyAttendanceRecord } from '@/types/attendance/records';
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

export function validateAttendanceRecord(
  record: any,
): DailyAttendanceRecord | null {
  if (!record) return null;

  try {
    const validatedRecord: DailyAttendanceRecord = {
      employeeId: record.employeeId || '',
      employeeName: record.employeeName || '',
      departmentName: record.departmentName || '',
      date: record.date || format(new Date(), 'yyyy-MM-dd'),
      state: record.state || 'absent',
      checkStatus: record.checkStatus || 'pending',
      overtimeState: record.overtimeState,
      regularCheckInTime: formatTimeString(record.regularCheckInTime),
      regularCheckOutTime: formatTimeString(record.regularCheckOutTime),
      isLateCheckIn: !!record.isLateCheckIn,
      isLateCheckOut: !!record.isLateCheckOut,
      isEarlyCheckIn: !!record.isEarlyCheckIn,
      isVeryLateCheckOut: !!record.isVeryLateCheckOut,
      lateCheckOutMinutes: Number(record.lateCheckOutMinutes) || 0,
      shift: validateShiftData(record.shift),
      isDayOff: !!record.isDayOff,
      leaveInfo: record.leaveInfo
        ? {
            type: record.leaveInfo.type || '',
            status: record.leaveInfo.status || '',
          }
        : null,
    };

    // Validate required fields
    if (!validatedRecord.employeeId || !validatedRecord.employeeName) {
      return null;
    }

    return validatedRecord;
  } catch (error) {
    console.error('Error validating attendance record:', error);
    return null;
  }
}

export function validateShiftData(shift: any): ShiftData | null {
  if (!shift) return null;

  try {
    return {
      id: shift.id || '',
      name: shift.name || '',
      shiftCode: shift.shiftCode || '',
      startTime: formatTimeString(shift.startTime) || '00:00',
      endTime: formatTimeString(shift.endTime) || '00:00',
      workDays: Array.isArray(shift.workDays)
        ? shift.workDays
        : [1, 2, 3, 4, 5],
    };
  } catch (error) {
    console.error('Error validating shift data:', error);
    return null;
  }
}

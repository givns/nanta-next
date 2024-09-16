import { UserData } from '../types/user';
import { AttendanceStatusInfo, ShiftData } from '../types/attendance';
import { UserRole } from '../types/enum';

export function isUserData(obj: any): obj is UserData {
  const checks = [
    { field: 'employeeId', check: () => typeof obj.employeeId === 'string' },
    { field: 'name', check: () => typeof obj.name === 'string' },
    {
      field: 'lineUserId',
      check: () =>
        obj.lineUserId === null || typeof obj.lineUserId === 'string',
    },
    {
      field: 'nickname',
      check: () => obj.nickname === null || typeof obj.nickname === 'string',
    },
    {
      field: 'departmentId',
      check: () =>
        obj.departmentId === null || typeof obj.departmentId === 'string',
    },
    {
      field: 'departmentName',
      check: () => typeof obj.departmentName === 'string',
    },
    { field: 'role', check: () => Object.values(UserRole).includes(obj.role) },
    {
      field: 'profilePictureUrl',
      check: () =>
        obj.profilePictureUrl === null ||
        typeof obj.profilePictureUrl === 'string',
    },
    {
      field: 'shiftId',
      check: () => obj.shiftId === null || typeof obj.shiftId === 'string',
    },
    {
      field: 'shiftCode',
      check: () => obj.shiftCode === null || typeof obj.shiftCode === 'string',
    },
    {
      field: 'overtimeHours',
      check: () => typeof obj.overtimeHours === 'number',
    },
    {
      field: 'potentialOvertimes',
      check: () => Array.isArray(obj.potentialOvertimes),
    },
    {
      field: 'sickLeaveBalance',
      check: () => typeof obj.sickLeaveBalance === 'number',
    },
    {
      field: 'businessLeaveBalance',
      check: () => typeof obj.businessLeaveBalance === 'number',
    },
    {
      field: 'annualLeaveBalance',
      check: () => typeof obj.annualLeaveBalance === 'number',
    },
    {
      field: 'createdAt',
      check: () =>
        typeof obj.createdAt === 'string' || obj.createdAt instanceof Date,
    },
    {
      field: 'updatedAt',
      check: () =>
        typeof obj.updatedAt === 'string' || obj.updatedAt instanceof Date,
    },
  ];

  for (const { field, check } of checks) {
    if (!check()) {
      console.error(`Invalid field in user data: ${field}`);
      return false;
    }
  }

  return true;
}

export function isAttendanceStatusInfo(obj: any): obj is AttendanceStatusInfo {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.status === 'string' &&
    typeof obj.isOvertime === 'boolean' &&
    typeof obj.overtimeDuration === 'number' &&
    typeof obj.detailedStatus === 'string' &&
    isUserData(obj.user) &&
    (obj.latestAttendance === null ||
      (typeof obj.latestAttendance === 'object' &&
        typeof obj.latestAttendance.id === 'string' &&
        typeof obj.latestAttendance.employeeId === 'string' &&
        typeof obj.latestAttendance.date === 'string' &&
        (obj.latestAttendance.checkInTime === null ||
          typeof obj.latestAttendance.checkInTime === 'string') &&
        (obj.latestAttendance.checkOutTime === null ||
          typeof obj.latestAttendance.checkOutTime === 'string') &&
        typeof obj.latestAttendance.status === 'string' &&
        typeof obj.latestAttendance.isManualEntry === 'boolean')) &&
    typeof obj.isCheckingIn === 'boolean' &&
    typeof obj.isDayOff === 'boolean' &&
    Array.isArray(obj.potentialOvertimes) &&
    (obj.shiftAdjustment === null || typeof obj.shiftAdjustment === 'object') &&
    (obj.approvedOvertime === null ||
      typeof obj.approvedOvertime === 'object') &&
    Array.isArray(obj.futureShifts) &&
    Array.isArray(obj.futureOvertimes)
  );
}

export function isShiftData(obj: any): obj is ShiftData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.startTime === 'string' &&
    typeof obj.endTime === 'string' &&
    Array.isArray(obj.workDays) &&
    obj.workDays.every((day: any) => typeof day === 'number') &&
    typeof obj.shiftCode === 'string'
  );
}

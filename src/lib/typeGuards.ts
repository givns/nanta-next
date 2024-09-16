import { UserData } from '../types/user';
import { AttendanceStatusInfo, ShiftData } from '../types/attendance';
import { UserRole } from '../types/enum';

export function isUserData(obj: any): obj is UserData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.employeeId === 'string' &&
    typeof obj.name === 'string' &&
    (obj.lineUserId === null || typeof obj.lineUserId === 'string') &&
    (obj.nickname === null || typeof obj.nickname === 'string') &&
    (obj.departmentId === null || typeof obj.departmentId === 'string') &&
    typeof obj.departmentName === 'string' &&
    Object.values(UserRole).includes(obj.role) &&
    (obj.profilePictureUrl === null ||
      typeof obj.profilePictureUrl === 'string') &&
    (obj.shiftId === null || typeof obj.shiftId === 'string') &&
    (obj.shiftCode === null || typeof obj.shiftCode === 'string') &&
    typeof obj.overtimeHours === 'number' &&
    Array.isArray(obj.potentialOvertimes) &&
    typeof obj.sickLeaveBalance === 'number' &&
    typeof obj.businessLeaveBalance === 'number' &&
    typeof obj.annualLeaveBalance === 'number' &&
    obj.createdAt instanceof Date &&
    obj.updatedAt instanceof Date
  );
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

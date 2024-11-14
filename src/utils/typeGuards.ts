// utils/typeGuards.ts
import {
  AttendanceStatusValue,
  AttendanceStatusType,
} from '../types/attendance';

export const attendanceStatusValues = [
  'present',
  'absent',
  'incomplete',
  'holiday',
  'off',
  'overtime',
] as const;

export const attendanceStatusTypes = [
  'checked-in',
  'checked-out',
  'overtime-started',
  'overtime-ended',
  'pending',
  'approved',
  'day-off',
  'incomplete',
  'overtime',
] as const;

export const statusValueToType = (
  status: AttendanceStatusValue,
): AttendanceStatusType => {
  const mappings: Record<AttendanceStatusValue, AttendanceStatusType> = {
    present: 'checked-out',
    absent: 'pending',
    incomplete: 'checked-in',
    holiday: 'approved',
    off: 'approved',
    overtime: 'overtime',
  };
  return mappings[status];
};

export const isAttendanceStatusValue = (
  status: string,
): status is AttendanceStatusValue => {
  return attendanceStatusValues.includes(status as AttendanceStatusValue);
};

export const isAttendanceStatusType = (
  status: string,
): status is AttendanceStatusType => {
  return attendanceStatusTypes.includes(status as AttendanceStatusType);
};

// Add a type assertion function
export const assertAttendanceStatus = (
  status: string,
): AttendanceStatusValue => {
  if (!isAttendanceStatusValue(status)) {
    throw new Error(`Invalid attendance status: ${status}`);
  }
  return status;
};

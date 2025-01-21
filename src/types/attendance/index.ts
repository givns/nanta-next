import { TimeEntryStatus } from '@prisma/client';
import { AttendanceStatusValue, OvertimeRequestStatus } from '../attendance';
import { OvertimeStatus } from '../attendance/status';
import { ProcessingOptions } from './processing';
import { AttendanceRecord, TimeEntry } from './records';

// types/attendance/index.ts
export * from './base';
export * from './records';
export * from './processing';
export * from './status';
export * from './shift';
export * from './leave';
export * from './check';
export * from './common';
export * from './manual';
export * from './department';
export * from './error';
export * from './props';
export * from './response';
export * from './validation';
export * from './utils';
export * from './overtime';
export * from './period';
export * from './state';
export * from './interface';
export * from './context';
export * from './location-assistance';
export * from './notification';

// Re-export common external types
export type { UserData } from '../user';
export type {
  PrismaClient,
  Prisma,
  User,
  Department,
  ShiftAdjustmentRequest,
  LeaveRequest as PrismaLeaveRequest,
  OvertimeRequest as PrismaOvertimeRequest,
  TimeEntry as PrismaTimeEntry,
  OvertimeEntry as PrismaOvertimeEntry,
} from '@prisma/client';

// Deprecated types - mark for removal
/**
 * @deprecated Use ProcessingOptions instead
 */
export type AttendanceInput = ProcessingOptions;

/**
 * @deprecated Use AttendanceRecord instead
 */
export type BaseAttendance = AttendanceRecord;

/**
 * @deprecated Use TimeEntry instead
 */
export type RawTimeEntry = TimeEntry;

// Type Guards
export const isAttendanceStatusValue = (
  status: string,
): status is AttendanceStatusValue => {
  return [
    'present',
    'absent',
    'incomplete',
    'holiday',
    'off',
    'overtime',
  ].includes(status);
};

export const isValidTimeEntryStatus = (
  status: string,
): status is TimeEntryStatus => {
  return ['STARTED', 'COMPLETED'].includes(status);
};

export const isValidOvertimeStatus = (
  status: string,
): status is OvertimeStatus => {
  return ['in_progress', 'completed'].includes(status);
};

export const isValidOvertimeRequestStatus = (
  status: string,
): status is OvertimeRequestStatus => {
  return [
    'pending_response',
    'pending',
    'approved',
    'rejected',
    'declined_by_employee',
  ].includes(status);
};

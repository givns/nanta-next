import { BaseEntity } from './base';
import { ApprovalStatus, LeaveFormat, LeaveType } from './status';

export interface LeaveRequest extends BaseEntity {
  leaveType: LeaveType;
  leaveFormat: LeaveFormat;
  reason: string;
  startDate: Date;
  endDate: Date;
  fullDayCount: number;
  status: ApprovalStatus;
  approverId: string | null;
  denierId: string | null;
  denialReason: string | null;
  resubmitted: boolean;
  originalRequestId: string | null;
  date: Date; // Required for AttendancePeriodContext
}

export interface LeaveInfo {
  type: LeaveType;
  status: ApprovalStatus;
}

export interface HalfDayLeaveContext {
  hasHalfDayLeave: boolean;
  checkInTime: Date | null;
  isMorningLeaveConfirmed: boolean;
  isAfternoonLeaveConfirmed: boolean;
}

export interface HolidayInfo {
  localName: string;
  name: string;
  date: string;
}
export interface PrismaHoliday {
  id: string;
  name: string;
  localName: string | null;
  date: Date;
}

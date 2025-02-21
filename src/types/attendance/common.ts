// types/attendance/common.ts

import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
  TimeEntry,
} from '@prisma/client';
import { LeaveRequest } from './leave';
import { ShiftData } from './shift';
import { ApprovedOvertimeInfo, PeriodStatus } from './status';
import { AttendanceStateResponse } from './state';

export interface QueueResult {
  status: AttendanceStateResponse;
  notificationSent: boolean;
  message?: string;
  success: boolean;
  autoCompletedEntries?: {
    regular?: TimeEntry;
    overtime?: TimeEntry[];
  };
}

export interface AttendancePeriodContext {
  date: Date;
  isHoliday: boolean;
  isDayOff: boolean;
  entryType: PeriodType;
  leaveRequest: LeaveRequest | null;
  approvedOvertime: ApprovedOvertimeInfo | null;
  effectiveShift: ShiftData | null;
  shiftTimes: {
    start: Date;
    end: Date;
  };
  PeriodStatus: PeriodStatus;
  user: {
    employeeId: string;
    shiftCode: string;
  };
}

export interface ErrorContext {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AttendanceCache {
  key: string;
  ttl: number;
  data: any;
}

export interface AttendanceMetrics {
  regularHours: number;
  overtimeHours: number;
  lateMinutes: number;
  earlyMinutes: number;
}

export interface DailyRecord {
  employeeId: string;
  name: string;
  departmentName: string;
  shift: {
    name: string;
    startTime: string;
    endTime: string;
  } | null;
  state: AttendanceState; // Changed from status
  checkStatus: CheckStatus; // New field
  overtimeState?: OvertimeState;
  attendance: {
    state: AttendanceState; // Changed from status
    checkStatus: CheckStatus;
    CheckInTime: string | null;
    CheckOutTime: string | null;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    isOvertime: boolean;
  } | null;
  leaveInfo?: {
    type: string;
    status: string;
  } | null;
  isDayOff: boolean;
}

// types/attendance/common.ts

import { LeaveRequest } from './leave';
import { ShiftData } from './shift';
import {
  ApprovedOvertimeInfo,
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodStatus,
  PeriodType,
} from './status';

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
    regularCheckInTime: string | null;
    regularCheckOutTime: string | null;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
  } | null;
  leaveInfo?: {
    type: string;
    status: string;
  } | null;
  isDayOff: boolean;
}
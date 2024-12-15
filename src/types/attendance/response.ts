// ===================================
// types/attendance/response.ts
// API response types
// ===================================

import { z } from 'zod';
import { AttendanceRecord, OvertimeEntry, TimeEntry } from './records';
import {
  AttendanceState,
  CheckStatus,
  EnhancedAttendanceStatus,
  LatestAttendance,
  NextPeriod,
  OvertimeState,
  PeriodType,
} from './status';
import { ValidationResult } from './validation';
import { OvertimeContext } from './overtime';

export interface AttendanceResponse
  extends SuccessResponse<{
    attendance: AttendanceRecord;
    state: AttendanceState;
    checkStatus: CheckStatus;
    overtimeState?: OvertimeState;
    validation: ValidationResult;
    timeEntries?: TimeEntry[];
    overtimeEntries?: OvertimeEntry[];
  }> {
  warnings?: Array<{
    code: string;
    message: string;
  }>;
}

export interface AttendanceStateResponse {
  base: {
    state: AttendanceState;
    checkStatus: CheckStatus;
    isCheckingIn: boolean;
    latestAttendance: LatestAttendance | null; // Use full interface, can be null
  };
  window: ShiftWindowResponse;
  validation?: ValidationResponseWithMetadata;
  enhanced: EnhancedAttendanceStatus; // Add enhanced statu
  timestamp: string;
}

export interface ValidationResponseWithMetadata {
  allowed: boolean;
  reason: string;
  flags: {
    isCheckingIn: boolean;
    isLateCheckIn: boolean;
    isEarlyCheckOut: boolean;
    isPlannedHalfDayLeave: boolean;
    isEmergencyLeave: boolean;
    isOvertime: boolean;
    requireConfirmation: boolean;
    isDayOffOvertime: boolean;
    isInsideShift: boolean;
    isAutoCheckIn: boolean;
    isAutoCheckOut: boolean;
  };
  metadata?: {
    missingEntries?: Array<{
      type: 'check-in' | 'check-out';
      periodType: PeriodType;
      expectedTime: Date;
      overtimeId?: string;
    }>;
    transitionWindow?: {
      // Add this type
      start: string;
      end: string;
      targetPeriod: PeriodType;
    };
  };
}

export interface ValidationResponse {
  allowed: boolean;
  reason: string;
  flags: {
    isLateCheckIn: boolean;
    isEarlyCheckOut: boolean;
    isPlannedHalfDayLeave: boolean;
    isEmergencyLeave: boolean;
    isOvertime: boolean;
    requireConfirmation: boolean;
    isDayOffOvertime: boolean;
    isInsideShift: boolean;
    isAutoCheckIn: boolean;
    isAutoCheckOut: boolean;
  };
}

export interface TimeEntriesResponse {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  records: DetailedTimeEntry[];
}

export interface DetailedTimeEntry {
  date: string;
  CheckInTime: string | null;
  CheckOutTime: string | null;

  // Status fields
  state: AttendanceState;
  checkStatus: CheckStatus;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  isManualEntry: boolean;

  // Type and hours
  entryType: PeriodType;
  regularHours: number;
  overtimeHours: number;

  // Related info
  leave: {
    type: string;
    status: string;
  } | null;

  overtimeRequest?: {
    id: string;
    startTime: string;
    endTime: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };

  canEditManually: boolean;
}

export interface BaseResponse {
  success: boolean;
  timestamp: string;
  requestId?: string;
}

export interface SuccessResponse<T> extends BaseResponse {
  success: true;
  data: T;
  metadata?: {
    count?: number;
    page?: number;
    totalPages?: number;
    [key: string]: any;
  };
}

export interface ErrorResponse extends BaseResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
}

export interface ShiftWindowResponse {
  current: {
    start: string;
    end: string;
  };
  type: PeriodType;
  shift: {
    id: string;
    shiftCode: string;
    name: string;
    startTime: string;
    endTime: string;
    workDays: number[];
  };
  isHoliday: boolean;
  isDayOff: boolean;
  isAdjusted: boolean;
  holidayInfo?: {
    name: string;
    date: string;
  };
  overtimeInfo?: OvertimeContext;
  nextPeriod?: NextPeriod | null;
}

export interface CheckInOutResponse {
  success: boolean;
  data?: {
    attendanceId: string;
    status: AttendanceState;
    timestamp: string;
  };
  error?: string;
}

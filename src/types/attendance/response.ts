// ===================================
// types/attendance/response.ts
// API response types
// ===================================

import { AttendanceRecord, OvertimeEntry, TimeEntry } from './records';
import {
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from './status';
import { ValidationResult } from './validation';

export interface AttendanceResponse
  extends SuccessResponse<{
    attendance: AttendanceRecord;
    state: AttendanceState;
    checkStatus: CheckStatus;
    overtimeState?: OvertimeState;
    validation?: ValidationResult;
    timeEntries?: TimeEntry[];
    overtimeEntries?: OvertimeEntry[];
  }> {
  warnings?: Array<{
    code: string;
    message: string;
  }>;
}

export interface TimeEntriesResponse {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  records: DetailedTimeEntry[];
}

export interface DetailedTimeEntry {
  date: string;
  regularCheckInTime: string | null;
  regularCheckOutTime: string | null;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  entryType: PeriodType;
  isManualEntry: boolean;
  regularHours: number;
  overtimeHours: number;
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
  } | null;
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

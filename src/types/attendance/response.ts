// ===================================
// types/attendance/response.ts
// API response types
// ===================================

import { z } from 'zod';
import { AttendanceRecord, OvertimeEntry, TimeEntry } from './records';
import {
  EnhancedAttendanceStatus,
  NextPeriod,
  PeriodType,
  TimelineEnhancement,
} from './status';
import { AttendanceValidation, ValidationResult } from './validation';
import { OvertimeContext } from './overtime';
import { OvertimePeriodInfo, PeriodAttendance } from './period';
import { LatestAttendanceResponse } from './base';
import { AttendanceState, CheckStatus, OvertimeState } from '@prisma/client';

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
  daily: {
    date: string;
    timeline: TimelineEnhancement;
    periods: Array<{
      type: PeriodType;
      window: {
        start: string;
        end: string;
      };
      status: {
        isComplete: boolean;
        isCurrent: boolean;
        requiresTransition: boolean;
      };
      attendance?: PeriodAttendance;
      overtime?: OvertimePeriodInfo;
    }>;
    transitions: PeriodTransition;
  };
  base: {
    state: AttendanceState;
    checkStatus: CheckStatus;
    isCheckingIn: boolean;
    latestAttendance: LatestAttendanceResponse | null;
  };
  window: ShiftWindowResponse;
  validation: AttendanceValidation;
  enhanced: EnhancedAttendanceStatus;
}

export interface AttendanceStatusResponse extends AttendanceStateResponse {}

export interface DailyAttendanceStatus {
  date: string;
  timeline: TimelineEnhancement;
  periods: Array<{
    type: PeriodType;
    window: {
      start: string;
      end: string;
    };
    status: {
      isComplete: boolean;
      isCurrent: boolean;
      requiresTransition: boolean;
    };
    attendance?: PeriodAttendance;
    overtime?: OvertimePeriodInfo;
  }>;
  transitions: PeriodTransition;
}

export interface PeriodTransition {
  from: {
    periodIndex: number;
    type: PeriodType;
  };
  to: {
    periodIndex: number;
    type: PeriodType;
  };
  transitionTime: string;
  isComplete: boolean;
}

export interface PeriodValidation {
  currentPeriod: {
    index: number;
    canCheckIn: boolean;
    canCheckOut: boolean;
    requiresTransition: boolean;
    message?: string;
    enhancement: {
      isWithinPeriod: boolean;
      isEarlyForPeriod: boolean;
      isLateForPeriod: boolean;
      periodStart: string;
      periodEnd: string;
    };
  };
  nextPeriod?: {
    index: number;
    availableAt: string;
    type: PeriodType;
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
  transition?: {
    from: {
      type: PeriodType;
      end: string;
    };
    to: {
      type: PeriodType;
      start: string | null;
    };
    isInTransition: boolean;
  };
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

export interface CheckInOutResponse {
  success: boolean;
  data?: {
    attendanceId: string;
    status: AttendanceState;
    timestamp: string;
  };
  error?: string;
}

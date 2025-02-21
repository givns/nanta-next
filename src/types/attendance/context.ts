// types/attendance/context.ts

import { AttendanceRecord } from './records';
import { LeaveRequest } from './leave';
import { ApprovedOvertimeInfo } from './status';
import { ShiftData } from './shift';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import { StateValidation, UnifiedPeriodState } from './state';
import { GeoLocation } from './base';

export interface HolidayContext {
  isHoliday: boolean;
  holidayName?: string;
  holidayType?: string;
  holidayDate?: Date;
  isWorkingHoliday: boolean;
  overtimeAllowed: boolean;
}

export interface UnifiedAttendanceContext {
  // Core context
  attendance: AttendanceRecord;
  employeeId: string;
  date: Date;

  // State context
  periodState: UnifiedPeriodState;

  // Status contexts
  leave?: {
    type: string;
    format: string;
    startTime?: string;
    endTime?: string;
  };
  overtime?: {
    id: string;
    startTime: string;
    endTime: string;
    isDayOff: boolean;
  };
  holiday?: {
    name: string;
    type: string;
  };

  // Location context
  location?: {
    coordinates?: { lat: number; lng: number };
    address?: string;
  };

  // Validation context
  stateValidation: StateValidation;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface ValidationContext {
  // Core data
  employeeId: string;
  timestamp: Date;
  isCheckIn: boolean;
  state?: AttendanceState;
  checkStatus?: CheckStatus;
  overtimeState?: OvertimeState;

  // Current state
  attendance?: AttendanceRecord;
  shift?: ShiftData;

  // Additional contexts
  isOvertime?: boolean;
  overtimeInfo?: ApprovedOvertimeInfo | null;
  leaveRequest?: LeaveRequest;

  // Location data
  location?: GeoLocation;
  address?: string;

  // Processing metadata
  periodType?: PeriodType;
  reason?: string;
  photo?: string;
}

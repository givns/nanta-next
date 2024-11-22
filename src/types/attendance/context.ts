// types/attendance/context.ts

import { AttendanceRecord } from './records';
import { TimeWindow, Location } from './base';
import { HalfDayLeaveContext, LeaveRequest } from './leave';
import {
  ApprovedOvertimeInfo,
  AttendanceState,
  CheckStatus,
  CurrentPeriodInfo,
  OvertimeState,
  PeriodType,
} from './status';
import { ShiftData } from './shift';

export interface HolidayContext {
  isHoliday: boolean;
  holidayName?: string;
  holidayType?: string;
  holidayDate?: Date;
  isWorkingHoliday: boolean;
  overtimeAllowed: boolean;
}

export interface AttendanceContext {
  // Core context
  attendance: AttendanceRecord;
  employeeId: string;
  date: Date;

  // Time context
  currentPeriod: CurrentPeriodInfo;
  timeWindow: TimeWindow;

  // Status contexts
  leaveContext: HalfDayLeaveContext;
  overtimeContext?: OvertimeContext;
  holidayContext?: HolidayContext;

  // Location context
  location?: Location;
  address?: string;

  // Validation context
  validation: ValidationContext;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface OvertimeContext {
  bounds: {
    plannedStartTime: Date;
    plannedEndTime: Date;
  };
  metadata: {
    isDayOffOvertime: boolean;
    isInsideShiftHours: boolean;
  };
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
  overtimeInfo?: ApprovedOvertimeInfo;
  leaveRequest?: LeaveRequest;

  // Location data
  location?: Location;
  address?: string;

  // Processing metadata
  periodType?: PeriodType;
  reason?: string;
  photo?: string;
}

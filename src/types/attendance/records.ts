// types/attendance/records.ts

import { GeoLocation } from './base';
import { ShiftData } from './shift';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
  TimeEntryStatus,
} from '@prisma/client';

export interface DailyAttendanceRecord {
  employeeId: string;
  employeeName: string;
  departmentName: string;
  date: string;
  state: AttendanceState;
  checkStatus: CheckStatus;
  overtimeState?: OvertimeState;
  CheckInTime: string | null;
  CheckOutTime: string | null;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  isEarlyCheckIn: boolean;
  isVeryLateCheckOut: boolean;
  lateCheckOutMinutes: number;
  shift: ShiftData | null;
  isDayOff: boolean;
  leaveInfo?: {
    type: string;
    status: string;
  } | null;
}

export interface AttendanceRecord {
  // Core identifiers - Keep
  id: string;
  employeeId: string;
  date: Date;

  // Core status - Keep and consolidate
  state: AttendanceState;
  checkStatus: CheckStatus;
  type: PeriodType;

  // Overtime information - Consolidate
  isOvertime: boolean;
  overtimeState?: OvertimeState;
  overtimeId?: string;
  overtimeDuration?: number;

  // Time fields - Keep
  shiftStartTime: Date | null;
  shiftEndTime: Date | null;
  CheckInTime: Date | null;
  CheckOutTime: Date | null;

  // Status flags - Group and simplify
  checkTiming: {
    isEarlyCheckIn: boolean;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    isVeryLateCheckOut: boolean;
    lateCheckOutMinutes: number;
  };

  // Location data - Group
  location: {
    checkIn?: {
      coordinates: GeoLocation | null;
      address: string | null;
    };
    checkOut?: {
      coordinates: GeoLocation | null;
      address: string | null;
    };
  };

  // Related entries - Keep
  overtimeEntries: OvertimeEntry[];
  timeEntries: TimeEntry[];

  // Metadata - Keep and extend
  metadata: {
    isManualEntry: boolean;
    isDayOff: boolean;
    createdAt: Date;
    updatedAt: Date;
    source: 'system' | 'manual' | 'auto';
  };
}

export interface TimeEntry {
  // Core identifiers - Keep
  id: string;
  employeeId: string;
  date: Date;

  // Time fields - Keep
  startTime: Date;
  endTime: Date | null;

  // Status and type - Keep
  status: TimeEntryStatus;
  entryType: PeriodType;

  // Duration tracking - Keep
  hours: {
    regular: number;
    overtime: number;
  };

  // References - Keep
  attendanceId: string | null;
  overtimeRequestId: string | null;

  // Timing statistics - Group
  timing: {
    actualMinutesLate: number;
    isHalfDayLate: boolean;
  };

  // Overtime specific data - Move to dedicated section
  overtime?: {
    metadata?: OvertimeMetadata;
    startReason?: string;
    endReason?: string;
    comments?: string;
  };

  // Metadata - Enhanced
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    source: 'system' | 'manual' | 'auto';
    version: number;
  };
}

export interface OvertimeEntry {
  id: string;
  attendanceId: string;
  overtimeRequestId: string;
  actualStartTime: Date | null;
  actualEndTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OvertimePeriod {
  overtimeRequestId: string;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  actualStartTime: Date | null;
  actualEndTime: Date | null;

  // Updated status fields
  state: OvertimeState; // Changed from status: 'in_progress' | 'completed'
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
}

export interface OvertimeMetadata {
  id: string;
  timeEntryId: string;
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
  createdAt: Date;
  updatedAt: Date;
}

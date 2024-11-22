// types/attendance/records.ts

import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  TimeEntryStatus,
  PeriodType,
} from './status';
import { Location } from './base';
import { ShiftData } from './shift';

export interface DailyAttendanceRecord {
  employeeId: string;
  employeeName: string;
  departmentName: string;
  date: string;
  state: AttendanceState;
  checkStatus: CheckStatus;
  overtimeState?: OvertimeState;
  regularCheckInTime: string | null;
  regularCheckOutTime: string | null;
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
  // Core fields
  id: string;
  employeeId: string;
  date: Date;

  // Status fields
  state: AttendanceState;
  checkStatus: CheckStatus;
  isOvertime: boolean;
  overtimeState?: OvertimeState;

  // Time fields
  shiftStartTime: Date | null;
  shiftEndTime: Date | null;
  regularCheckInTime: Date | null;
  regularCheckOutTime: Date | null;

  // Status flags
  isEarlyCheckIn: boolean;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  isVeryLateCheckOut: boolean;
  lateCheckOutMinutes: number;

  // Location data
  checkInLocation: Location | null;
  checkOutLocation: Location | null;
  checkInAddress: string | null;
  checkOutAddress: string | null;

  // Metadata
  checkInReason?: string | null;
  checkInPhoto?: string | null;
  checkOutPhoto?: string | null;
  isManualEntry: boolean;

  // Related entries
  overtimeEntries: OvertimeEntry[];
  timeEntries: TimeEntry[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  date: Date;
  startTime: Date;
  endTime: Date | null;

  // Updated status fields
  status: TimeEntryStatus;
  entryType: PeriodType;

  // Hours
  regularHours: number;
  overtimeHours: number;

  // References
  attendanceId: string | null;
  overtimeRequestId: string | null;

  // Metadata
  actualMinutesLate: number;
  isHalfDayLate: boolean;
  overtimeMetadata?: OvertimeMetadata;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface OvertimeEntry {
  id: string;
  attendanceId: string;
  overtimeRequestId: string;
  actualStartTime: Date;
  actualEndTime: Date | null;
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
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

// ===================================
// types/attendance/processing.ts
// Processing related types
// ===================================

import { Prisma } from '@prisma/client';
import { Location, TimeWindow } from './base';
import { CacheConfig } from './cache';
import { AttendancePeriodContext } from './common';
import { AttendanceRecord } from './records';
import { AttendanceTransaction } from './transaction';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from './status';
import { ValidationContext } from './context';

export interface RawAttendanceData {
  id: string;
  employeeId: string;
  date: Date;
  status: string;
  regularCheckInTime: Date | null;
  regularCheckOutTime: Date | null;
  shiftStartTime: Date | null;
  shiftEndTime: Date | null;
  overtimePeriods: Prisma.JsonValue;
  checkInLocation: Prisma.JsonValue | null;
  checkOutLocation: Prisma.JsonValue | null;
  checkInAddress: string | null;
  checkOutAddress: string | null;
  checkInReason: string | null;
  // other fields
  overtimeEntries: Array<{
    id: string;
    attendanceId: string;
    overtimeRequestId: string;
    actualStartTime: Date;
    actualEndTime: Date | null;
    status: 'in_progress' | 'completed';
    createdAt: Date;
    updatedAt: Date;
  }>;
  timeEntries: Array<{
    id: string;
    date: Date;
    startTime: Date;
    endTime: Date | null;
    status: string;
    entryType: string;
    overtimeMetadata: {
      isDayOffOvertime: boolean;
      isInsideShiftHours: boolean;
    } | null;
  }>;
}

export interface AttendanceInput {
  employeeId: string;
  lineUserId: string | null;
  checkTime: string;
  location?: Location;
  address?: {
    checkIn?: string;
    checkOut?: string;
  };
  reason?: string;
  photo?: string;
  isCheckIn: boolean;
  isOvertime: boolean;
  overtimeRequestId?: string;
  isManualEntry: boolean;
}

export interface ProcessingOptions {
  // Core identifiers
  employeeId: string;
  lineUserId?: string;

  // Time information
  checkTime: string | Date;

  // Check-in/out flags
  isCheckIn: boolean;
  isOvertime?: boolean;
  isManualEntry?: boolean;

  // Status information
  state?: AttendanceState; // Optional current state
  checkStatus?: CheckStatus; // Optional current status
  overtimeState?: OvertimeState; // Optional overtime state
  entryType: PeriodType; // Optional entry type

  // Location data
  location?: Location; // Optional GPS coordinates
  address?: string; // Optional location name
  inPremises?: boolean;

  // Additional data
  overtimeRequestId?: string;
  reason?: string;
  photo?: string;
  updatedBy?: string;

  // Metadata
  metadata?: Omit<Record<string, unknown>, 'periodType'>;
}

// Separate options type for client-side use
export interface ClientProcessingOptions
  extends Omit<ProcessingOptions, 'inPremises' | 'address'> {
  // These will be added by useSimpleAttendance
  inPremises?: never;
  address?: never;
}

// Deprecated - use ProcessingOptions instead
/** @deprecated Use ProcessingOptions instead */
export interface AttendanceProcessingOptions extends ProcessingOptions {}

export interface ProcessedPeriod {
  type: PeriodType;
  checkTime: Date;
  state: AttendanceState; // Changed from status
  checkStatus: CheckStatus; // New field
  overtimeState?: OvertimeState;
  flags: {
    isEarlyCheckIn: boolean;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    isVeryLateCheckOut: boolean;
    isAutoCheckIn?: boolean;
    isAutoCheckOut?: boolean;
  };
  metadata?: {
    overtimeRequestId?: string;
    isDayOffOvertime?: boolean;
    isInsideShiftHours?: boolean;
    missedCheckInTime?: number;
  };
}

// Processing result interface
export interface ProcessingResult {
  success: boolean;
  timestamp: string;
  data: ProcessedAttendance;
  errors?: string;
  metadata?: {
    source?: 'manual' | 'system' | 'auto-checkout';
    location?: Location;
    reason?: string;
    [key: string]: unknown;
  };
}

export interface ProcessedPeriodResult {
  type: PeriodType;
  checkTime: Date;
  state: AttendanceState; // Changed from status
  checkStatus: CheckStatus; // New field
  overtimeState?: OvertimeState;
  flags: {
    isEarlyCheckIn: boolean;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    isVeryLateCheckOut: boolean;
    isAutoCheckIn?: boolean;
    isAutoCheckOut?: boolean;
  };
  metadata?: {
    overtimeRequestId?: string;
    isDayOffOvertime?: boolean;
    isInsideShiftHours?: boolean;
    missedCheckInTime?: number;
  };
}

export interface ProcessedAttendance {
  // Core fields
  id: string;
  employeeId: string;
  date: Date;

  // Status fields
  state: AttendanceState; // Changed from status
  checkStatus: CheckStatus; // New field
  overtimeState?: OvertimeState; // New field
  detailedStatus: string;

  // Hours
  regularHours: number;
  overtimeHours: number;

  // Time fields
  regularCheckInTime?: Date | null;
  regularCheckOutTime?: Date | null;

  // Overtime data
  overtime?: {
    isDayOffOvertime: boolean;
    isInsideShiftHours: boolean;
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
    actualStartTime: Date;
    actualEndTime: Date;
    state: OvertimeState; // New field
  };

  // Processing metadata
  isManualEntry?: boolean;
  updatedBy?: string;
  updatedAt?: Date;
}

// Helper to determine if overtime is allowed
export interface OvertimeProcessingContext {
  isAllowed: boolean;
  currentPeriodType: PeriodType;
  overtimeState?: OvertimeState;
  bounds?: {
    plannedStartTime: Date;
    plannedEndTime: Date;
  };
}

export interface ProcessingContext {
  // Core processing data
  attendance: AttendanceRecord;
  options: ProcessingOptions;

  // Period information
  period: AttendancePeriodContext;
  currentPeriod: {
    type: PeriodType;
    window: TimeWindow;
  };

  // Processing components
  validation: ValidationContext;
  transaction: AttendanceTransaction;
  cache: CacheConfig;

  // Additional data
  metadata?: Record<string, unknown>;
}

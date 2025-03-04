// ===================================
// types/attendance/processing.ts
// Processing related types
// ===================================

import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
  Prisma,
} from '@prisma/client';
import {
  AttendanceStatusResponse,
  StateValidation,
  UnifiedPeriodState,
} from './state';
import { TimeEntry } from './records';
import { GeoLocation } from './base';

export interface AttendanceLocation {
  checkIn?: {
    coordinates: GeoLocation | null;
    address: string | null;
  };
  checkOut?: {
    coordinates: GeoLocation | null;
    address: string | null;
  };
}

// Core Processing Types
export interface ProcessingOptions {
  // Core identifiers
  employeeId: string;
  lineUserId?: string;

  // Time context
  checkTime: string; // ISO string
  periodType: PeriodType;

  // Activity type
  activity: {
    isCheckIn: boolean;
    isOvertime?: boolean;
    isTransition?: boolean;
    isManualEntry?: boolean;
    requireConfirmation?: boolean;
    overtimeMissed?: boolean;
  };

  // Location context
  location?: {
    coordinates?: GeoLocation;
    address?: string;
    inPremises?: boolean;
  };

  // State transition
  transition?: {
    from?: {
      type: PeriodType;
      endTime: string; // ISO string
    };
    to?: {
      type: PeriodType;
      startTime: string; // ISO string
    };
  };

  // Additional metadata
  metadata?: {
    overtimeId?: string;
    overtimeEndTime?: string;
    reason?: string;
    photo?: string;
    source?: 'manual' | 'system' | 'auto';
    updatedBy?: string;
  };
  requestId?: string;
  preCalculatedStatus?: AttendanceStatusResponse;
  usePrismaAccelerate?: boolean;
}

export interface ProcessingResult {
  success: boolean;
  timestamp: string; // ISO string
  requestId?: string;
  data: {
    state: {
      current: UnifiedPeriodState;
      previous?: UnifiedPeriodState;
    };
    validation: StateValidation;
  };
  errors?: string[];
  metadata?: {
    source: 'manual' | 'system' | 'auto';
    autoCompleted?: {
      regular?: TimeEntry;
      overtime?: TimeEntry[];
    };
    [key: string]: unknown;
  };
  message?: string;
}

export interface RawAttendanceData {
  // Core data
  id: string;
  employeeId: string;
  date: Date;

  // Status
  state: AttendanceState;
  checkStatus: CheckStatus;
  overtimeState?: OvertimeState;

  // Time data
  timeWindow: {
    start: Date | null;
    end: Date | null;
  };
  activity: {
    checkIn: Date | null;
    checkOut: Date | null;
  };

  // Location data
  location: {
    checkIn?: Prisma.JsonValue;
    checkOut?: Prisma.JsonValue;
    checkInAddress?: string;
    checkOutAddress?: string;
  };

  // Related entries
  timeEntries: Array<{
    id: string;
    date: Date;
    startTime: Date;
    endTime: Date | null;
    status: string;
    entryType: PeriodType;
    metadata?: Record<string, unknown>;
  }>;
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

  // Metadata
  metadata: {
    source: 'manual' | 'system' | 'auto';
    reason?: string;
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

// Separate options type for client-side use
export interface ClientProcessingOptions
  extends Omit<ProcessingOptions, 'inPremises' | 'address'> {
  // These will be added by useSimpleAttendance
  inPremises?: never;
  address?: never;
}

export interface ProcessingContext {
  period: {
    type: PeriodType;
    timeWindow: {
      start: string;
      end: string;
    };
  };
  validation: {
    isAllowed: boolean;
    reason?: string;
    flags: {
      isOvertime: boolean;
      isTransition: boolean;
      requiresConfirmation: boolean;
    };
  };
  metadata?: Record<string, unknown>;
}

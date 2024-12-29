// ===================================
// types/attendance/base.ts
// Core type definitions and enums
// ===================================

import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import { AttendanceRecord } from './records';

// Core interfaces - Keep
export interface BaseEntity {
  id: string;
  employeeId: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}
export interface Location {
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: Date;
  provider?: string;
}

// GeoLocation interface (used in our system)
export interface GeoLocation {
  lat: number;
  lng: number;
  longitude: number;
  latitude: number;
  accuracy?: number;
  timestamp?: Date;
  provider?: string;
}

// Type for JSON storage
export interface GeoLocationJson extends Record<string, any> {
  lat: number;
  lng: number;
  longitude: number;
  latitude: number;
  accuracy?: number;
  timestamp?: string; // Note: string for JSON storage
  provider?: string;
}

export interface LocationState {
  status: 'initializing' | 'loading' | 'ready' | 'error';
  inPremises: boolean;
  address: string;
  confidence: 'high' | 'medium' | 'low' | 'manual';
  coordinates?: {
    lat: number;
    lng: number;
  };
  error: string | null;
}

export interface BaseStatus {
  state: AttendanceState;
  checkStatus: CheckStatus;
  isCheckingIn: boolean;
  latestAttendance: AttendanceRecord | null;
}

export interface AttendanceBaseResponse {
  // Core status
  state: AttendanceState;
  checkStatus: CheckStatus;
  isCheckingIn: boolean;

  // Current attendance record
  latestAttendance: AttendanceRecord | null; // Using our updated AttendanceRecord type

  // Basic period info
  periodInfo: {
    type: PeriodType;
    isOvertime: boolean;
    overtimeState?: OvertimeState;
  };

  // Base validation
  validation: {
    canCheckIn: boolean;
    canCheckOut: boolean;
    message?: string;
  };

  // Metadata
  metadata: {
    lastUpdated: string; // ISO string
    version: number;
    source: 'system' | 'manual' | 'auto';
  };
}

export interface AttendanceCore {
  state: AttendanceState;
  checkStatus: CheckStatus;
  isCheckingIn: boolean;
  latestAttendance?: {
    CheckInTime?: Date;
    CheckOutTime?: Date;
    isLateCheckIn?: boolean;
    isOvertime?: boolean;
  };
}

// Same structure as AttendanceRecord but with
// Date fields as ISO strings for API response
export interface SerializedAttendanceRecord {
  // Core identifiers
  id: string;
  employeeId: string;
  date: string; // ISO string

  // Core status
  state: AttendanceState;
  checkStatus: CheckStatus;
  type: PeriodType;

  // Overtime information
  isOvertime: boolean;
  overtimeState?: OvertimeState;
  overtimeId?: string;
  overtimeDuration?: number;

  // Time fields (all ISO strings)
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  CheckInTime: string | null;
  CheckOutTime: string | null;

  // Status flags
  checkTiming: {
    isEarlyCheckIn: boolean;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    isVeryLateCheckOut: boolean;
    lateCheckOutMinutes: number;
  };

  // Location data
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

  // Serialized time entries
  timeEntries: Array<{
    id: string;
    startTime: string;
    endTime: string | null;
    type: PeriodType;
  }>;

  // Metadata (with serialized dates)
  metadata: {
    isManualEntry: boolean;
    isDayOff: boolean;
    createdAt: string;
    updatedAt: string;
    source: 'system' | 'manual' | 'auto';
  };
}

export interface AddressInput {
  checkIn?: string;
  checkOut?: string;
}

export interface TimeWindow {
  start: Date;
  end: Date;
  isFlexible?: boolean; // Enhanced
  gracePeriod?: number; // Enhanced
}

export interface Metadata {
  version: number;
  isManualEntry?: boolean;
  reason?: string;
  photo?: string;
  lastModifiedBy?: string; // Enhanced
  lastModifiedAt?: Date; // Enhanced
  source?: string; // Enhanced
}

// Constants used across the service
export const CACHE_CONSTANTS = {
  USER_CACHE_TTL: 72 * 60 * 60, // 24 hours
  ATTENDANCE_CACHE_TTL: 30 * 60, // 30 minutes
  HOLIDAY_CACHE_TTL: 72 * 60 * 60, // 24 hours
  PROCESS_TIMEOUT: 65000,
  QUEUE_TIMEOUT: 60000,
  RETRY_DELAY: 2000,
  MAX_RETRIES: 0,
  CACHE_TIMEOUT: 5 * 60 * 1000, // 5 minutes
  CACHE_KEY_PATTERNS: {
    USER: 'user:',
    ATTENDANCE: 'attendance:',
    HOLIDAY: 'holiday:',
  },
} as const;

export const ATTENDANCE_CONSTANTS = {
  EARLY_CHECK_IN_THRESHOLD: 29, // 29 minutes
  LATE_CHECK_IN_THRESHOLD: 5, // 5 minutes
  LATE_CHECK_OUT_THRESHOLD: 15, // 15 minutes
  EARLY_CHECK_OUT_THRESHOLD: 5, // 5 minutes
  VERY_LATE_THRESHOLD: 30, // 30 minutes
  AUTO_CHECKOUT_WINDOW: 60, // 60 minutes
} as const;

export const LOCATION_CONSTANTS = {
  REFRESH_INTERVAL: 30000, // 30 seconds
  STALE_THRESHOLD: 60000, // 1 minute
  CACHE_TIME: 30000, // 30 seconds
};

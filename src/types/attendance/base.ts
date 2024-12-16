// ===================================
// types/attendance/base.ts
// Core type definitions and enums
// ===================================

import { AttendanceState, CheckStatus, OvertimeState } from '@prisma/client';
import { PeriodType } from './status';

// Core interfaces - Keep
export interface BaseEntity {
  id: string;
  employeeId: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}
export interface Location {
  lat: number;
  lng: number;
  longitude: number;
  latitude: number;
  accuracy?: number; // Enhanced
  timestamp?: Date; // Enhanced
  provider?: string; // Enhanced
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

export interface LatestAttendanceResponse {
  id: string;
  employeeId: string;
  date: string;
  CheckInTime: string | null;
  CheckOutTime: string | null;
  state: AttendanceState;
  checkStatus: CheckStatus;
  overtimeState?: OvertimeState;
  isLateCheckIn?: boolean;
  isLateCheckOut?: boolean;
  isEarlyCheckIn?: boolean;
  isOvertime?: boolean;
  isManualEntry: boolean;
  isDayOff: boolean;
  shiftStartTime?: string;
  shiftEndTime?: string;
  periodType: PeriodType;
  overtimeId?: string;
  timeEntries?: Array<{
    id: string;
    startTime: string;
    endTime: string | null;
    type: PeriodType;
  }>;
}

// Then update AttendanceBaseResponse
export interface AttendanceBaseResponse {
  state: AttendanceState;
  checkStatus: CheckStatus;
  isCheckingIn: boolean;
  latestAttendance?: LatestAttendanceResponse;
  periodInfo: {
    currentType: PeriodType;
    isOvertime: boolean;
    overtimeState?: OvertimeState;
    isTransitioning: boolean;
  };
  flags: AttendanceFlags;
  metadata: {
    lastUpdated: string;
    version: number;
    source: 'system' | 'manual' | 'auto';
  };
}

export interface AttendanceFlags {
  isOvertime: boolean;
  isDayOffOvertime: boolean;
  isPendingDayOffOvertime: boolean;
  isPendingOvertime: boolean;
  isOutsideShift: boolean;
  isInsideShift: boolean;
  isLate: boolean;
  isEarlyCheckIn: boolean;
  isEarlyCheckOut: boolean;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  isVeryLateCheckOut: boolean;
  isAutoCheckIn: boolean;
  isAutoCheckOut: boolean;
  isAfternoonShift: boolean;
  isMorningShift: boolean;
  isAfterMidshift: boolean;
  isApprovedEarlyCheckout: boolean;
  isPlannedHalfDayLeave: boolean;
  isEmergencyLeave: boolean;
  hasActivePeriod: boolean;
  requiresAutoCompletion: boolean;
  isHoliday: boolean;
  isDayOff: boolean;
  isManualEntry: boolean;
  hasPendingTransition?: boolean;
  requiresOvertimeCheckIn?: boolean;
  requiresTransition?: boolean;
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
  EARLY_CHECK_OUT_THRESHOLD: 15, // 15 minutes
  VERY_LATE_THRESHOLD: 30, // 30 minutes
  AUTO_CHECKOUT_WINDOW: 60, // 60 minutes
} as const;

export const LOCATION_CONSTANTS = {
  REFRESH_INTERVAL: 30000, // 30 seconds
  STALE_THRESHOLD: 60000, // 1 minute
  CACHE_TIME: 30000, // 30 seconds
};

// ===================================
// types/attendance/base.ts
// Core type definitions and enums
// ===================================

import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
  TimeEntryStatus,
} from '@prisma/client';
import { AttendanceRecord, OvertimeMetadata } from './records';

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

// types/location.ts

export type LocationConfidence = 'high' | 'medium' | 'low' | 'manual';

export type LocationApprovalPriority = 'admin_approved' | 'system' | null;

export type LocationStatus =
  | 'initializing'
  | 'loading'
  | 'ready'
  | 'error'
  | 'pending_admin'
  | 'waiting_admin';

export type VerificationStatus =
  | 'pending'
  | 'verified'
  | 'needs_verification'
  | 'admin_pending';

export interface LocationPoint {
  lat: number;
  lng: number;
}

export interface LocationState {
  status: LocationStatus;
  verificationStatus: VerificationStatus;
  inPremises: boolean;
  address: string;
  confidence: LocationConfidence;
  accuracy: number;
  coordinates?: LocationPoint;
  error: string | null;
  triggerReason: string | null;
  adminRequestId?: string;
}

export interface LocationVerificationState extends LocationState {
  lastVerifiedAt?: Date;
  priority?: LocationApprovalPriority; // Add this
}

// Define what fields can be required
export type RequiredFields = keyof LocationVerificationState;

// Define valid state transitions
export type ValidStateTransition = {
  [K in LocationStatus]: {
    to: LocationStatus[];
    requiredFields: Partial<Record<RequiredFields, boolean>>;
  };
};

export type LocationStateContextType = {
  locationState: LocationVerificationState;
  isLoading: boolean;
  needsVerification: boolean;
  isVerified: boolean;
  isAdminPending: boolean;
  triggerReason?: string | null;
  verifyLocation: (force?: boolean) => Promise<boolean>;
  requestAdminAssistance: () => Promise<void>;
};

export interface LocationTriggerConfig {
  maxAccuracy: number;
  maxRetries: number;
  maxWaitTime: number;
  minDistance: number;
  workplaceCoordinates: LocationPoint[];
}

export const STATE_TRANSITIONS: ValidStateTransition = {
  initializing: {
    to: ['loading', 'error'],
    requiredFields: {},
  },
  loading: {
    to: ['ready', 'error', 'pending_admin'],
    requiredFields: {
      accuracy: true,
    },
  },
  ready: {
    to: ['loading', 'error', 'pending_admin'],
    requiredFields: {
      confidence: true,
      inPremises: true,
    },
  },
  error: {
    to: ['loading', 'pending_admin'],
    requiredFields: {
      error: true,
      triggerReason: true,
    },
  },
  pending_admin: {
    to: ['waiting_admin', 'error'],
    requiredFields: {
      triggerReason: true,
    },
  },
  waiting_admin: {
    to: ['ready', 'error'],
    requiredFields: {
      adminRequestId: true,
    },
  },
};

export const INITIAL_STATE: LocationVerificationState = {
  status: 'initializing',
  verificationStatus: 'pending',
  inPremises: false,
  address: '',
  confidence: 'low',
  accuracy: 0,
  error: null,
  triggerReason: null,
};

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
  latestAttendance: SerializedAttendanceRecord | null; // Using our updated AttendanceRecord type
  additionalRecords?: SerializedAttendanceRecord[]; // Add this field

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
  periodSequence: number; // Add explicit periodSequence

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
    lateCheckInMinutes: number;
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
  overtimeEntries: SerializedOvertimeEntry[];

  timeEntries: SerializedTimeEntry[];

  // Metadata (with serialized dates)
  metadata: {
    isManualEntry: boolean;
    isDayOff: boolean;
    createdAt: string;
    updatedAt: string;
    source: 'system' | 'manual' | 'auto';
  };
}

export interface SerializedOvertimeEntry {
  id: string;
  attendanceId: string;
  overtimeRequestId: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  createdAt: string;
  updatedAt: string;
}

// First define the serialized version of TimeEntry
export interface SerializedTimeEntry {
  id: string;
  employeeId: string;
  startTime: string;
  endTime: string | null;
  status: TimeEntryStatus;
  entryType: PeriodType;
  hours: {
    regular: number;
    overtime: number;
  };
  attendanceId: string | null;
  overtimeRequestId: string | null;
  timing: {
    actualMinutesLate: number;
    isHalfDayLate: boolean;
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
    source: 'system' | 'manual' | 'auto';
    version: number;
  };
}

export interface AddressInput {
  checkIn?: string;
  checkOut?: string;
}

export interface TimeWindow {
  start: Date;
  end: Date;
  type: PeriodType; // Add missing type property
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
  OT_EARLY_CHECKIN: 10, // 10 minutes
  LATE_CHECK_IN_THRESHOLD: 5, // 5 minutes
  LATE_CHECK_OUT_THRESHOLD: 15, // 15 minutes
  EARLY_CHECK_OUT_THRESHOLD: 5, // 5 minutes
  TRANSITION_EARLY_BUFFER: 5, // 5 minutes before shift end
  TRANSITION_LATE_BUFFER: 15, // 15 minutes after shift end
  EARLY_CHECKOUT_BUFFER: 5,
  VERY_LATE_THRESHOLD: 30, // 30 minutes
  AUTO_CHECKOUT_WINDOW: 60, // 60 minutes
} as const;

export const LOCATION_CONSTANTS = {
  REFRESH_INTERVAL: 30000, // 30 seconds
  STALE_THRESHOLD: 60000, // 1 minute
  CACHE_TIME: 30000, // 30 seconds
};

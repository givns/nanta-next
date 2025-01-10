import {
  AttendanceFilters,
  AttendanceStateResponse,
  AttendanceStatusResponse,
  DailyAttendanceRecord,
  DepartmentInfo,
  EarlyCheckoutType,
  HolidayInfo,
  ManualEntryRequest,
  OvertimeContext,
  PeriodTransition,
  ProcessingResult,
  ShiftContext,
  ShiftData,
  StateValidation,
  TransitionContext,
  UnifiedPeriodState,
  UserData,
  ValidationFlags,
  ValidationMetadata,
} from '../attendance';
import { KeyedMutator } from 'swr';
import {
  AttendanceBaseResponse,
  LocationState,
  SerializedAttendanceRecord,
} from './base';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';

export interface StatusChangeParams {
  isCheckingIn: boolean;
  photo: string;
  lateReason?: string;
  isLate?: boolean;
  isOvertime?: boolean;
  isEarlyCheckOut?: boolean;
  earlyCheckoutType?: EarlyCheckoutType;
}

export interface UseDailyAttendanceProps {
  lineUserId: string | null;
  initialDate?: Date | string;
  initialDepartment?: string;
  initialSearchTerm?: string;
  enabled?: boolean;
}
export interface UseDailyAttendanceReturn {
  records: DailyAttendanceRecord[];
  filteredRecords: DailyAttendanceRecord[];
  departments: DepartmentInfo[];
  isLoading: boolean;
  error: string | null;
  filters: AttendanceFilters;
  setFilters: (filters: Partial<AttendanceFilters>) => void;
  createManualEntry: (data: ManualEntryRequest) => Promise<void>;
  refreshData: () => Promise<void>;
}

export interface AttendanceControlProps {
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onLocationUpdate: () => void;
}

export interface UseSimpleAttendanceProps {
  employeeId?: string;
  lineUserId?: string | null; // Changed to allow null
  initialAttendanceStatus?: AttendanceStatusResponse; // Changed to match API response
  enabled?: boolean;
}

export interface CheckInOutData {
  // Required fields (as per schema)
  isCheckIn: boolean;
  checkTime: string;
  periodType: PeriodType;

  // Optional base fields
  employeeId?: string;
  lineUserId?: string;

  // Activity object (required in schema)
  activity: {
    isCheckIn: boolean;
    isOvertime?: boolean;
    isManualEntry?: boolean;
    requireConfirmation?: boolean;
    overtimeMissed?: boolean;
  };

  // Location data (optional)
  location?: {
    coordinates?: {
      lat: number;
      lng: number;
      accuracy?: number;
      longitude?: number;
      latitude?: number;
      timestamp?: string;
      provider?: string;
    };
    address?: string;
    inPremises?: boolean;
  };

  // Transition data (optional)
  transition?: {
    from?: {
      type: PeriodType;
      endTime: string;
    };
    to?: {
      type: PeriodType;
      startTime: string;
    };
  };

  // Metadata (optional)
  metadata?: {
    overtimeId?: string;
    reason?: string;
    photo?: string;
    source?: 'manual' | 'system' | 'auto';
    updatedBy?: string;
  };
}

export interface CheckInOutFormProps {
  userData: UserData;
  onComplete?: () => void;
}

export interface ProcessingViewProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  metadata?: {
    nextAction?: string;
    requiresConfirmation?: boolean;
  };
  onRetry: () => void;
}

export interface ActionButtonProps {
  isEnabled: boolean;
  validation: {
    message?: string;
    nextTransitionTime?: string;
  };
  isCheckingIn: boolean;
  onAction: () => void;
  locationState: LocationState;
}

export interface UseAttendanceDataProps {
  employeeId?: string;
  lineUserId?: string;
  locationState: LocationState;
  initialAttendanceStatus?: AttendanceStatusResponse;
  enabled?: boolean;
}

export interface UseSimpleAttendanceReturn {
  // Core attendance states
  state: AttendanceState;
  checkStatus: CheckStatus;
  isCheckingIn: boolean;
  base: AttendanceBaseResponse;

  // Period and validation states
  periodState: UnifiedPeriodState;
  stateValidation: StateValidation;

  // Context information
  context: ShiftContext & TransitionContext;
  transitions: PeriodTransition[];
  hasPendingTransition: boolean;
  nextTransition: PeriodTransition | null;

  // Schedule status
  isDayOff: boolean;
  isHoliday: boolean;
  isAdjusted: boolean;
  holidayInfo?: HolidayInfo;

  // Transition information
  nextPeriod?: {
    type: PeriodType;
    startTime: string;
  } | null;
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

  // Shift information
  shift: ShiftData | null;

  // Loading and error states
  isLoading: boolean;
  isLocationLoading: boolean;
  error?: string;

  // Location information
  locationReady: boolean;
  locationState: LocationState;

  // Actions
  checkInOut: (data: CheckInOutData) => Promise<ProcessingResult>;
  refreshAttendanceStatus: () => Promise<void>;
  getCurrentLocation: () => Promise<LocationState>;
}

export interface ManualEntryFormData {
  date: string;
  periodType: PeriodType;
  timeWindow: {
    start?: string; // ISO string
    end?: string; // ISO string
  };
  metadata: {
    reasonType: 'correction' | 'missing' | 'system_error' | 'other';
    reason: string;
    overtimeId?: string;
  };
}

export interface CheckInOutParams {
  photo: string;
  checkTime: string;
  isCheckIn: boolean;
  reason?: string;
  isOvertime?: boolean;
  overtimeId?: string;
  earlyCheckoutType?: 'planned' | 'emergency';
  lateReason?: string;
}

export interface OvertimeInfoUI {
  id: string;
  timeWindow: {
    start: string;
    end: string;
  };
  details: {
    durationMinutes: number;
    isInsideShiftHours: boolean;
    isDayOffOvertime: boolean;
    reason?: string;
  };
}

export interface ProcessingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

//for mobileAttendanceApp

export interface ProgressMetrics {
  lateMinutes: number;
  earlyMinutes: number;
  isEarly: boolean;
  progressPercent: number;
  totalShiftMinutes: number;
  isMissed: boolean;
}

export interface ExtendedOvertimeInfo {
  checkIn: string | null | undefined;
  checkOut: string | null | undefined;
  isActive: boolean;
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
  reason?: string;
  validationWindow?: {
    earliestCheckIn: string;
    latestCheckOut: string;
  };
}

export interface ExtendedValidation {
  allowed: boolean;
  reason: string;
  flags: ValidationFlags;
  metadata: ValidationMetadata;
}

// in types/attendance/props.ts

// For today's summary
export interface TodaySummaryProps {
  userData: UserData;
  records: Array<{
    record: SerializedAttendanceRecord;
    periodSequence: number;
  }>;
  onViewNextDay: () => void;
  onClose?: () => void;
}

// For next day info
export interface NextDayScheduleInfo {
  isHoliday: boolean;
  holidayInfo?: {
    name: string;
    date: string;
  };
  isDayOff: boolean;
  leaveInfo?: {
    type: string;
    duration: string;
    status: string;
  } | null;
  shift: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    isAdjusted: boolean;
    adjustedInfo?: {
      originalStart: string;
      originalEnd: string;
      reason: string;
    };
  };
  overtimes?: OvertimeContext[];
}

export interface NextDayInfoProps {
  nextDayInfo: NextDayScheduleInfo;
  onClose?: () => void;
}

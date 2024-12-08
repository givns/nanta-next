import {
  AttendanceFilters,
  AttendanceResponse,
  AttendanceStateResponse,
  CheckInOutAllowance,
  DailyAttendanceRecord,
  DepartmentInfo,
  EarlyCheckoutType,
  ManualEntryRequest,
  ShiftData,
  UserData,
  ValidationResponse,
  ValidationResult,
} from '../attendance';
import { ProcessingResult } from './processing';
import {
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  CurrentPeriodInfo,
  OvertimeState,
  PeriodType,
} from './status';
import { KeyedMutator } from 'swr';
import { LocationState } from './base';
import { OvertimeContext } from './overtime';

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
  initialAttendanceStatus?: AttendanceStateResponse | null; // Changed to match API response
  enabled?: boolean;
}

export interface UseSimpleAttendanceState {
  attendanceStatus: AttendanceStatusInfo | null;
  state: AttendanceState;
  checkStatus: CheckStatus;
  effectiveShift: ShiftData;
  currentPeriod: CurrentPeriodInfo | null;
  locationReady: boolean; // Added missing property
  inPremises: boolean;
  address: string;
  isLoading: boolean;
  error: string | null;
  checkInOutAllowance: CheckInOutAllowance | null;
}

export interface CheckInOutData {
  // Required fields
  employeeId: string;
  lineUserId: string | null;
  checkTime: string;
  isCheckIn: boolean;
  address: string;
  inPremises: boolean; // Added required field
  confidence: 'high' | 'medium' | 'low' | 'manual'; // Added 'manual' option
  entryType: PeriodType;

  // Optional fields
  photo?: string;
  reason?: string;
  isOvertime?: boolean;
  isManualEntry?: boolean; // Added optional field
  overtimeRequestId?: string; // Added for overtime validation
  earlyCheckoutType?: 'planned' | 'emergency';
  isLate?: boolean;
  state?: AttendanceState; // Added optional field
  checkStatus?: CheckStatus; // Added optional field
  overtimeState?: OvertimeState; // Added optional field

  // Location data
  location?: {
    lat: number;
    lng: number;
  };

  // Metadata
  metadata?: {
    overtimeId?: string;
    isDayOffOvertime?: boolean;
    isInsideShiftHours?: boolean;
    [key: string]: unknown; // Allow additional metadata
  };
}

export interface CheckInOutFormProps {
  userData: UserData;
  onComplete?: () => void;
}

export interface ProcessingViewProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  onRetry: () => void;
}

export interface ActionButtonProps {
  isEnabled: boolean;
  validationMessage?: string;
  nextWindowTime?: Date; // Add this
  isCheckingIn: boolean;
  onAction: () => void;
  locationState: {
    isReady: boolean;
    error?: string;
  };
}

export interface UseSimpleAttendanceActions {
  // Updated to use CheckInOutData instead of ProcessingOptions
  checkInOut: (params: CheckInOutData) => Promise<ProcessingResult>;
  refreshAttendanceStatus: {
    (options?: {
      forceRefresh?: boolean;
      throwOnError?: boolean;
    }): Promise<void>;
    mutate: KeyedMutator<AttendanceResponse>;
  };
  getCurrentLocation: (forceRefresh?: boolean) => Promise<LocationState>;
}

export interface UseSimpleAttendanceReturn {
  // Core attendance states
  state: AttendanceState;
  checkStatus: CheckStatus;
  isCheckingIn: boolean;

  // Shift and period info
  currentPeriod: CurrentPeriodInfo | null;
  effectiveShift: ShiftData | null;
  isDayOff: boolean;
  isHoliday: boolean;

  // Overtime context
  overtimeContext: OvertimeContext | null;

  // Validation and status
  validation: ValidationResponse | null; // Changed from ValidationResult

  // Loading and error states
  isLoading: boolean;
  isLocationLoading: boolean;
  error?: string;

  // Location information
  locationReady: boolean;
  locationState: LocationState;

  // Actions
  checkInOut: (params: CheckInOutData) => Promise<ProcessingResult>;
  refreshAttendanceStatus: {
    (options?: {
      forceRefresh?: boolean;
      throwOnError?: boolean;
    }): Promise<void>;
    mutate: KeyedMutator<AttendanceStateResponse>;
  };
  getCurrentLocation: () => Promise<LocationState>;
}

export interface ManualEntryFormData {
  date: string;
  periodType: PeriodType;
  checkInTime?: string;
  checkOutTime?: string;
  reasonType: 'correction' | 'missing' | 'system_error' | 'other';
  reason: string;
  overtimeRequestId?: string; // Added for overtime entries
  overtimeStartTime?: string; // Added for overtime entries
  overtimeEndTime?: string; // Added for overtime entries
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

export interface UserShiftInfoProps {
  userData: UserData;
  status: {
    state: AttendanceState;
    checkStatus: CheckStatus;
    isCheckingIn: boolean;
    currentPeriod: CurrentPeriodInfo | null;
    isHoliday: boolean;
    isDayOff: boolean;
    isOvertime: boolean;
    latestAttendance?: {
      regularCheckInTime?: Date;
      regularCheckOutTime?: Date;
      overtimeCheckInTime?: Date;
      overtimeCheckOutTime?: Date;
      isLateCheckIn?: boolean;
      isOvertime?: boolean;
    };
  };
  effectiveShift: ShiftData | null; // Add this line
  isLoading?: boolean;
}

export interface ProcessingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

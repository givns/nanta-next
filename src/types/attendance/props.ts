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
} from '../attendance';
import { ProcessingResult } from './processing';
import {
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  CurrentPeriodInfo,
  PeriodType,
} from './status';
import { KeyedMutator } from 'swr';
import { Location, LocationState } from './base';

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
  employeeId: string;
  lineUserId: string | null;
  isCheckIn: boolean;
  checkTime: string | Date;
  location?: Location;
  address: string;
  reason?: string;
  photo?: string;
  isLate?: boolean;
  isOvertime?: boolean;
  isEarlyCheckOut?: boolean;
  earlyCheckoutType?: EarlyCheckoutType;
  isManualEntry?: boolean;
  entryType: PeriodType;
  confidence: 'high' | 'medium' | 'low';
  metadata?: {
    overtimeId?: string;
    isDayOffOvertime?: boolean;
    isInsideShiftHours?: boolean;
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
  isLoading: boolean;
  checkInOutAllowance: ValidationResponse | null;
  isCheckingIn: boolean;
  locationReady: boolean;
  onAction: () => void; // Changed type
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
  effectiveShift: ShiftData | null;
  currentPeriod: CurrentPeriodInfo | null;
  validation: ValidationResponse | null;

  // Location states
  locationReady: boolean;
  locationState: LocationState;
  isLocationLoading: boolean;

  // Loading/Error states
  isLoading: boolean;
  error: string | null;

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

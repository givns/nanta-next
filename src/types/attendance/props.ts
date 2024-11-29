import {
  AttendanceFilters,
  CheckInOutAllowance,
  DailyAttendanceRecord,
  DepartmentInfo,
  EarlyCheckoutType,
  ManualEntryRequest,
  ShiftData,
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
import { Location } from './base';

export interface StatusChangeParams {
  isCheckingIn: boolean;
  photo: string;
  lateReason?: string;
  isLate?: boolean;
  isOvertime?: boolean;
  isEarlyCheckOut?: boolean;
  earlyCheckoutType?: EarlyCheckoutType;
}

export interface UseAttendanceProps {
  lineUserId: string | null;
  initialDate?: Date | string;
  initialDepartment?: string;
  initialSearchTerm?: string;
  enabled?: boolean;
}
export interface UseAttendanceReturn {
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
  lineUserId: string | null;
  initialAttendanceStatus: AttendanceStatusInfo | null;
  enabled?: boolean;
}

export interface UseSimpleAttendanceState {
  attendanceStatus: AttendanceStatusInfo | null;
  state: AttendanceState;
  checkStatus: CheckStatus;
  effectiveShift: ShiftData | null;
  currentPeriod: CurrentPeriodInfo | null;
  inPremises: boolean;
  address: string;
  isLoading: boolean;
  isLocationLoading?: boolean;
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

export interface UseSimpleAttendanceActions {
  // Updated to use CheckInOutData instead of ProcessingOptions
  checkInOut: (data: CheckInOutData) => Promise<ProcessingResult>;
  refreshAttendanceStatus: {
    (options?: {
      forceRefresh?: boolean;
      throwOnError?: boolean;
    }): Promise<void>;
    mutate: KeyedMutator<UseSimpleAttendanceState>;
  };
  getCurrentLocation: () => Promise<void>;
  locationReady: boolean;
}

export type UseSimpleAttendanceReturn = UseSimpleAttendanceState &
  UseSimpleAttendanceActions;

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

// types/attendance.ts

import {
  Attendance,
  ShiftAdjustmentRequest,
  OvertimeEntry,
  TimeEntry,
  Prisma,
} from '@prisma/client';
import { UserData } from './user';

export type { Attendance, ShiftAdjustmentRequest, OvertimeEntry, TimeEntry };

// Location Interface
export interface Location {
  lat: number;
  lng: number;
}

interface HolidayInfo {
  localName: string;
  name: string;
  date: string;
}

export type EarlyCheckoutType = 'emergency' | 'planned';

// Attendance Data Interfaces
export interface AttendanceData {
  employeeId: string;
  lineUserId: string | null;
  checkTime: string;
  location?: string;
  checkInAddress?: string;
  checkOutAddress?: string;
  reason?: string;
  photo?: string;
  isCheckIn: boolean;
  isOvertime?: boolean;
  isLate?: boolean;
  isEarlyCheckOut?: boolean;
  earlyCheckoutType?: EarlyCheckoutType;
  isManualEntry: boolean;
}

// Overtime Interfaces
export type OvertimeRequestStatus =
  | 'pending_response'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'declined_by_employee';

export interface ApprovedOvertime {
  id: string;
  employeeId: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: OvertimeRequestStatus;
  employeeResponse: string | null;
  reason: string | null;
  approverId: string | null;
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OvertimeInfo {
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
  startTime: string;
  endTime: string;
}

export interface OvertimeWindows {
  earlyCheckInWindow: Date;
  lateCheckOutWindow: Date;
}

export interface OvertimeCheckInOutData {
  actualStartTime?: Date;
  actualEndTime?: Date;
  plannedStartTime?: Date;
  plannedEndTime?: Date;
}

export interface ExtendedApprovedOvertime extends ApprovedOvertime {
  overtimeEntries: OvertimeEntryData[];
}

export interface OvertimeEntryData {
  id: string;
  attendanceId: string;
  overtimeRequestId: string;
  actualStartTime: Date;
  actualEndTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Attendance Status Interfaces
export type AttendanceStatusValue =
  | 'present'
  | 'absent'
  | 'incomplete'
  | 'holiday'
  | 'off'
  | 'overtime';

export type AttendanceStatusType =
  | 'checked-in'
  | 'checked-out'
  | 'overtime-started'
  | 'overtime-ended'
  | 'pending'
  | 'approved'
  | 'day-off';

export interface LateCheckOutStatus {
  isLateCheckOut: boolean;
  isVeryLateCheckOut: boolean; // More than 30 minutes late
  minutesLate: number;
}

export interface AttendanceStatusInfo {
  status: AttendanceStatusValue;
  isOvertime: boolean;
  overtimeDuration?: number;
  overtimeEntries: OvertimeEntryData[];
  detailedStatus: string;
  isEarlyCheckIn: boolean;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  user: UserData;
  latestAttendance: {
    id: string;
    employeeId: string;
    date: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    status: AttendanceStatusType;
    isManualEntry: boolean;
  } | null;
  isCheckingIn: boolean;
  isDayOff: boolean;
  isHoliday: boolean;
  holidayInfo?: HolidayInfo | null;
  dayOffType: 'holiday' | 'weekly' | 'none';
  shiftAdjustment: {
    date: string;
    requestedShiftId: string;
    requestedShift: ShiftData;
  } | null;
  approvedOvertime: ApprovedOvertime | null;
  allApprovedOvertimes?: ApprovedOvertime[]; // Add this field to track all overtimes
  futureShifts: Array<{
    date: string;
    shift: ShiftData;
  }>;
  futureOvertimes: Array<ApprovedOvertime>;
  pendingLeaveRequest: boolean;
  leaveRequests?: {
    status: string;
    leaveFormat: string;
    startDate: string;
    endDate: string;
  }[];
}

// Attendance Hook Return Interface
export interface AttendanceHookReturn {
  attendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
  isLoading: boolean;
  error: string | null;
  inPremises: boolean;
  address: string;
  checkInOut: (data: AttendanceData) => Promise<any>;
  checkInOutAllowance: CheckInOutAllowance | null;
  refreshAttendanceStatus: (forceRefresh?: boolean) => Promise<any>;
  getCurrentLocation: () => void;
}

// Shift Data Interface
export type ShiftData = {
  id: string;
  name: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  workDays: number[];
};

// Attendance Record Interface
export interface AttendanceRecord extends Attendance {
  overtimeEntries: OvertimeEntryData[];
  timeEntries: TimeEntry[];
}

// Processed Attendance Interface
export interface ProcessedAttendance {
  id: string;
  employeeId: string;
  date: Date;
  status: AttendanceStatusValue;
  regularHours: number;
  overtimeHours: number;
  overtimeInfo?: OvertimeInfo;
  detailedStatus: string;
  attendanceStatusType: AttendanceStatusType;
}

// Time Entry Data Interface
export interface TimeEntryData {
  id: string;
  employeeId: string;
  date: Date;
  startTime: Date;
  endTime: Date | null;
  regularHours: number;
  overtimeHours: number;
  status: 'in_progress' | 'completed';
  attendanceId: string | null;
  overtimeRequestId: string | null;
  entryType: 'regular' | 'overtime';
  overtimeMetadata?: {
    isDayOffOvertime: boolean;
    isInsideShiftHours: boolean;
  };
}

// Raw data from API/Database
export interface RawTimeEntry {
  id: string;
  employeeId: string;
  date: string | Date;
  startTime: string | Date;
  endTime: string | Date | null;
  regularHours: number;
  overtimeHours: number;
  status: string;
  attendanceId: string | null;
  overtimeRequestId: string | null;
  entryType: string;
  overtimeMetadata?: {
    isDayOffOvertime: boolean;
    isInsideShiftHours: boolean;
  };
}

export function transformTimeEntry(raw: RawTimeEntry): TimeEntryData {
  return {
    id: raw.id,
    employeeId: raw.employeeId,
    date: new Date(raw.date),
    startTime: new Date(raw.startTime),
    endTime: raw.endTime ? new Date(raw.endTime) : null,
    regularHours: raw.regularHours,
    overtimeHours: raw.overtimeHours,
    status: raw.status === 'in_progress' ? 'in_progress' : 'completed',
    attendanceId: raw.attendanceId,
    overtimeRequestId: raw.overtimeRequestId,
    entryType: raw.entryType === 'overtime' ? 'overtime' : 'regular',
    overtimeMetadata: {
      isDayOffOvertime: raw.overtimeMetadata?.isDayOffOvertime || false,
      isInsideShiftHours: raw.overtimeMetadata?.isInsideShiftHours || false,
    },
  };
}

// Shift Adjustment Interfaces
export interface ShiftAdjustment {
  date: string;
  requestedShiftId: string;
  requestedShift: ShiftData;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FutureShiftAdjustment {
  date: string;
  shift: ShiftData;
}

export interface ShiftAdjustmentRequestData {
  id: string;
  employeeId: string;
  requestedShiftId: string;
  date: Date;
  reason: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// Leave Request Interface
export interface LeaveRequestData {
  employeeId: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  leaveFormat: string;
  reason: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  leaveType: string;
  leaveFormat: string;
  reason: string;
  startDate: Date;
  endDate: Date;
  fullDayCount: number;
  approverId: string | null;
  denierId: string | null;
  denialReason: string | null;
  resubmitted: boolean;
  originalRequestId: string | null;
}

// Overtime Approval Interface
export interface OvertimeApproval {
  id: string;
  employeeId: string;
  date: Date;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

// Work Hours Calculation Interface
export interface WorkHoursCalculation {
  regularHours: number;
  overtimeHours: number;
  minutesLate: number;
  isHalfDayLate: boolean;
  actualWorkMinutes: number;
  earlyDepartureMinutes: number;
  hasUnapprovedEarlyDeparture: boolean;
}

// Check In/Out Allowance Interface
export interface CheckInOutAllowance {
  allowed: boolean;
  reason: string;
  isLate?: boolean;
  isOvertime?: boolean;
  countdown?: number;
  isOutsideShift?: boolean;
  inPremises: boolean;
  address: string;
  isDayOffOvertime?: boolean;
  isPendingDayOffOvertime?: boolean;
  isPendingOvertime?: boolean;
  requireConfirmation?: boolean;
  isEarlyCheckIn?: boolean;
  isEarlyCheckOut?: boolean;
  isLateCheckIn?: boolean;
  isLateCheckOut?: boolean;
  isVeryLateCheckOut?: boolean;
  isInsideShift?: boolean;
  actualStartTime?: Date;
  actualEndTime?: Date;
  plannedStartTime?: Date;
  plannedEndTime?: Date;
  isAutoCheckIn?: boolean;
  isAutoCheckOut?: boolean;
  missedCheckInTime?: number;
  lateCheckOutMinutes?: number;
  isPotentialOvertime?: boolean;
  isAfternoonShift?: boolean;
  isMorningShift?: boolean;
  isApprovedEarlyCheckout?: boolean;
  isPlannedHalfDayLeave?: boolean;
  isEmergencyLeave?: boolean;
  isAfterMidshift?: boolean;
  earlyCheckoutType?: EarlyCheckoutType;
}

// Check In/Out Data Interfaces
export interface CheckInData {
  employeeId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  isLate?: boolean;
}

export interface CheckOutData {
  attendanceId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
}

export interface HalfDayLeaveContext {
  hasHalfDayLeave: boolean;
  checkInTime: Date | null;
  isMorningLeaveConfirmed: boolean;
  isAfternoonLeaveConfirmed: boolean;
}

export interface DailyAttendanceShift {
  startTime: string;
  endTime: string;
  name: string;
}

export interface DailyAttendanceRecord {
  employeeId: string;
  name: string;
  departmentName: string;
  shift: {
    name: string;
    startTime: string;
    endTime: string;
  } | null;
  status: string;
  attendance: {
    regularCheckInTime: string | null;
    regularCheckOutTime: string | null;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
  } | null;
  leaveInfo?: {
    type: string;
    status: string;
  } | null;
  isDayOff: boolean;
}

// Add this interface for raw attendance data
export interface RawAttendanceData {
  id: string;
  regularCheckInTime: Date | null;
  regularCheckOutTime: Date | null;
  isLateCheckIn: boolean | null;
  isLateCheckOut: boolean | null;
  isEarlyCheckIn: boolean | null;
  isVeryLateCheckOut: boolean | null;
  lateCheckOutMinutes: number | null;
  status: string;
  isDayOff: boolean;
}

// Update the Prisma query types
export type AttendanceSelect = Prisma.AttendanceSelect & {
  id: true;
  regularCheckInTime: true;
  regularCheckOutTime: true;
  isLateCheckIn: true;
  isLateCheckOut: true;
  isEarlyCheckIn: true;
  isVeryLateCheckOut: true;
  lateCheckOutMinutes: true;
  status: true;
  isDayOff: true;
};

export interface AttendanceDetails {
  id: string;
  regularCheckInTime: string | null;
  regularCheckOutTime: string | null;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  isEarlyCheckIn: boolean;
  isVeryLateCheckOut: boolean;
  lateCheckOutMinutes: number;
  status: string;
}

export interface LeaveInfo {
  type: string;
  status: string;
}

// Complete daily attendance response
export interface DailyAttendanceResponse {
  employeeId: string;
  employeeName: string;
  departmentName: string;
  date: string;
  shift: {
    name: string;
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
  } | null;
  attendance: AttendanceDetails | null;
  leaveInfo?: LeaveInfo | null;
  isDayOff: boolean;
}

export interface TimeEntryWithDate {
  id: string;
  employeeId: string;
  date: Date;
  startTime: Date | null;
  endTime: Date | null;
  regularHours: number;
  overtimeHours: number;
  status: 'in_progress' | 'completed';
  attendanceId: string | null;
  overtimeRequestId: string | null;
  entryType: 'regular' | 'overtime';
  isLate: boolean;
  isDayOff: boolean;
  overtimeMetadata?: {
    isDayOffOvertime: boolean;
    isInsideShiftHours: boolean;
  };
}
export interface DetailedTimeEntry {
  date: string;
  regularCheckInTime: string | null;
  regularCheckOutTime: string | null;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  status: string;
  isManualEntry: boolean;
  regularHours: number;
  overtimeHours: number;
  leave: {
    type: string;
    status: string;
  } | null;
  overtimeDetails: Array<{
    startTime: string | null;
    endTime: string | null;
    status: string;
  }>;
  canEditManually: boolean;
}

export interface TimeEntriesResponse {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  records: DetailedTimeEntry[];
}

export interface UseAttendanceProps {
  lineUserId: string | null;
  initialDate?: Date;
  initialDepartment?: string;
  initialSearchTerm?: string;
}

export interface ManualEntryRequest {
  employeeId: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  reason: string;
}

export interface ManualEntryResponse {
  success: boolean;
  attendance: DailyAttendanceRecord;
  message: string;
  data?: any;
}

export interface DepartmentInfo {
  id: string;
  name: string;
}

export interface AttendanceFilters {
  date: Date;
  department: string;
  searchTerm: string;
}

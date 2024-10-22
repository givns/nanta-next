// types/attendance.ts

import {
  Attendance,
  ShiftAdjustmentRequest,
  OvertimeEntry,
  TimeEntry,
} from '@prisma/client';
import { UserData } from './user';

export type { Attendance, ShiftAdjustmentRequest, OvertimeEntry, TimeEntry };

export interface Location {
  lat: number;
  lng: number;
}

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
}

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
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtendedApprovedOvertime extends ApprovedOvertime {
  overtimeEntries: OvertimeEntryData[];
}

export type OvertimeRequestStatus =
  | 'pending_response'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'declined_by_employee';

export interface OvertimeEntryData {
  id: string;
  attendanceId: string;
  overtimeRequestId: string;
  actualStartTime: Date;
  actualEndTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  shiftAdjustment: {
    date: string;
    requestedShiftId: string;
    requestedShift: ShiftData;
  } | null;
  approvedOvertime: ApprovedOvertime | null;
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
  | 'denied';

export type ShiftData = {
  id: string;
  name: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  workDays: number[];
};

export interface AttendanceRecord extends Attendance {
  overtimeEntries: OvertimeEntry[];
  timeEntries: TimeEntry[];
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: Date;
  isDayOff: boolean;
  shiftStartTime: Date | null;
  shiftEndTime: Date | null;
  regularCheckInTime: Date | null;
  regularCheckOutTime: Date | null;
  isEarlyCheckIn: boolean | null;
  isLateCheckIn: boolean | null;
  isLateCheckOut: boolean | null;
  checkInLocation: any | null;
  checkOutLocation: any | null;
  checkInAddress: string | null;
  checkOutAddress: string | null;
  checkInReason: string | null;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  status: string;
  isManualEntry: boolean;
  overtimeEntries: OvertimeEntry[];
  timeEntries: TimeEntry[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ProcessedAttendance {
  id: string;
  employeeId: string;
  date: Date;
  status: AttendanceStatusValue;
  regularHours: number;
  overtimeHours: number;
  detailedStatus: string;
  attendanceStatusType: AttendanceStatusType;
}

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
}

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

export interface OvertimeApproval {
  id: string;
  employeeId: string;
  date: Date;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
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

export interface LeaveRequestData {
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface WorkHoursCalculation {
  regularHours: number;
  overtimeHours: number;
}

export interface ManualEntryData {
  employeeId: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  reason: string;
}

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
  isPotentialOvertime?: boolean;
}

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

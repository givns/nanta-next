// types/attendance.ts

import { Attendance, ShiftAdjustmentRequest } from '@prisma/client';
import { UserData } from './user';

export type { Attendance, ShiftAdjustmentRequest };

export interface Location {
  lat: number;
  lng: number;
}

export interface AttendanceData {
  employeeId: string;
  lineUserId: string;
  checkTime: string | Date;
  location: string;
  address: string;
  reason?: string;
  photo?: string;
  deviceSerial: string;
  isCheckIn: boolean;
  isOvertime?: boolean;
  isLate: boolean;
  isFlexibleStart?: boolean;
  isFlexibleEnd?: boolean;
  isWithinGracePeriod?: boolean;
}

export type ApprovedOvertime = {
  id: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  status: string;
  approvedBy: string;
  approvedAt: Date;
  date: Date;
};

export interface AttendanceStatusInfo {
  status: AttendanceStatusValue;
  isOvertime: boolean;
  overtimeDuration: number | undefined;
  detailedStatus: string;
  isEarlyCheckIn: boolean | undefined;
  isLateCheckIn: boolean | undefined;
  isLateCheckOut: boolean | undefined;
  user: UserData;
  latestAttendance: {
    id: string;
    employeeId: string;
    date: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    checkInDeviceSerial: string;
    checkOutDeviceSerial: string | null;
    status: AttendanceStatusType;
    isManualEntry: boolean;
  } | null;
  isCheckingIn: boolean;
  isDayOff: boolean;
  potentialOvertimes: PotentialOvertime[];
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
}

export type AttendanceStatusValue =
  | 'present'
  | 'absent'
  | 'incomplete'
  | 'holiday'
  | 'off';

export type AttendanceStatusType =
  | 'checked-in'
  | 'checked-out'
  | 'overtime-started'
  | 'overtime-ended'
  | 'pending'
  | 'approved'
  | 'denied';

export interface PotentialOvertime {
  id: string;
  employeeId: string;
  date: Date;
  hours: number;
  type: 'early-check-in' | 'late-check-out' | 'day-off';
  status: 'pending' | 'approved' | 'rejected';
  periods?: { start: string; end: string }[];
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShiftData {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays: number[];
  shiftCode: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  attendanceTime: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  regularHours: number;
  isOvertime: boolean;
  isDayOff: boolean;
  overtimeStartTime: string | null;
  overtimeEndTime: string | null;
  overtimeHours: number;
  overtimeDuration: number;
  checkInLocation: any | null;
  checkOutLocation: any | null;
  checkInAddress: string | null;
  checkOutAddress: string | null;
  checkInReason: string | null;
  checkOutReason: string | null;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  checkInDeviceSerial: string | null;
  checkOutDeviceSerial: string | null;
  status: AttendanceStatusType;
  isManualEntry: boolean;
}

export type ProcessedAttendance = {
  id: string;
  employeeId: string;
  date: Date;
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatusValue;
  regularHours: number;
  overtimeHours?: number;
  isOvertime: boolean;
  potentialOvertimePeriods?: {
    start: string;
    end: string;
  }[];
  isEarlyCheckIn?: boolean;
  isLateCheckIn?: boolean;
  isLateCheckOut?: boolean;
  detailedStatus: string;
  overtimeDuration: number;
  checkInDeviceSerial: string | null;
  checkOutDeviceSerial: string | null;
  isManualEntry: boolean;
};

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
  useOvertimeHours: boolean;
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

export interface CheckInFormData {
  employeeId: string;
  checkTime: Date;
  location: Location;
  address: string;
  reason?: string;
  photo?: string;
  deviceSerial: string;
}

export interface CheckOutFormData
  extends Omit<CheckInFormData, 'userId' | 'employeeId'> {
  checkInId: string;
}

export interface CheckInData {
  employeeId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  deviceSerial?: string;
  isLate?: boolean;
}

export interface CheckOutData {
  attendanceId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  deviceSerial?: string;
}
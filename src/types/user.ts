import {
  User,
  Shift,
  Attendance,
  ShiftAdjustmentRequest,
} from '@prisma/client';
import { UserRole } from '../types/enum';

export type { User, Attendance, Shift, ShiftAdjustmentRequest };
export interface UserData {
  employeeId: string;
  name: string;
  lineUserId: string | null;
  nickname: string | null;
  departmentId: string;
  department: string;
  role: UserRole;
  profilePictureUrl: string | null;
  profilePictureExternal: string | null;
  shiftId: string;
  assignedShift: {
    id: string;
    shiftCode: string;
    name: string;
    startTime: string;
    endTime: string;
    workDays: number[];
  };
  overtimeHours: number;
  potentialOvertimes: PotentialOvertime[];
  sickLeaveBalance: number;
  businessLeaveBalance: number;
  annualLeaveBalance: number;
  overtimeLeaveBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum CheckType {
  Auto = 0,
  CheckIn = 1,
  CheckOut = 2,
  OvertimeStart = 3,
  OvertimeEnd = 4,
  BackToWork = 5,
  LeaveDuringWork = 6,
}

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

export interface ApprovedOvertime {
  id: string;
  employeeId: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: string;
  reason: string | null;
  approvedBy: string;
  approvedAt: Date;
}

export interface AttendanceStatus {
  status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off';
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
  shiftCode: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: Date;
  attendanceTime: Date;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  isOvertime: boolean;
  isDayOff: boolean;
  overtimeStartTime: Date | null;
  overtimeEndTime: Date | null;
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
  status: string;
  isManualEntry: boolean;
}

export type ProcessedAttendance = {
  id: string;
  employeeId: string;
  date: Date;
  checkIn?: string;
  checkOut?: string;
  status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off';
  regularHours: number;
  potentialOvertimePeriods: {
    start: string;
    end: string;
  }[];
  isEarlyCheckIn?: boolean;
  isLateCheckIn?: boolean;
  isLateCheckOut?: boolean;
  overtimeHours?: number;
  isOvertime: boolean;
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

export interface UserResponse {
  user: UserData;
  attendanceStatus: AttendanceStatus;
  recentAttendance: AttendanceRecord[];
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  overtimeHours: number;
  balanceLeave: number;
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

export interface UserWithShift extends User {
  shift: Shift;
}

export interface CheckInFormData {
  employeeId: string;
  checkTime: Date;
  location: {
    lat: number;
    lng: number;
  };
  address: string;
  reason?: string;
  photo?: string;
  deviceSerial: string;
}

export interface CheckOutFormData
  extends Omit<CheckInFormData, 'userId' | 'employeeId'> {
  checkInId: string;
}

export interface ExternalUserInfo {
  user_no: string;
  user_fname?: string;
  user_lname?: string;
  user_photo: string;
}

export interface ExternalCheckInData {
  sj: string;
  user_no: string;
  user_fname?: string;
  user_lname?: string;
  user_photo: string;
  department: string;
  user_depname: string;
  user_dep: string;
  bh: number;
  fx: number;
  iden: string | null;
  dev_serial: string;
  dev_state: number;
  deal_state: number;
  dev_logic_bh: number | null;
  date: string;
  time: string;
}

export interface ExternalCheckInInputData {
  employeeId: string;
  timestamp: Date;
  checkType: number;
  deviceSerial: string;
}

export interface ExternalManualEntryInputData {
  employeeId: string;
  checkInTimestamp: Date;
  checkOutTimestamp?: Date;
  deviceSerial: string;
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

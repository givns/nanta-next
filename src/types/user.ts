import {
  User,
  Shift,
  Attendance,
  ShiftAdjustmentRequest,
} from '@prisma/client';
import { UserRole } from '@/types/enum';

export type { User, Attendance, Shift, ShiftAdjustmentRequest };
export interface UserData {
  id: string;
  lineUserId: string | null;
  name: string;
  nickname: string | null;
  departmentId: string;
  department: string;
  employeeId: string;
  role: UserRole;
  shiftId: string;
  assignedShift?: Shift | null | undefined;
  profilePictureUrl: string | null;
  profilePictureExternal: string | null;
  createdAt: Date;
  updatedAt: Date | null;
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

export interface AttendanceData {
  userId: string;
  employeeId: string;
  checkTime: string;
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
  userId: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: string;
  reason: string | null;
  approvedBy: string;
  approvedAt: Date;
}

export interface AttendanceStatus {
  user: UserData;
  latestAttendance: {
    id: string;
    userId: string;
    date: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    checkInDeviceSerial: string;
    checkOutDeviceSerial: string | null;
    status: 'checked-in' | 'checked-out';
    isManualEntry: boolean;
  } | null;
  isCheckingIn: boolean;
  isDayOff: boolean;
  potentialOvertime: {
    start: string;
    end: string;
  } | null;
  shiftAdjustment: {
    date: string;
    requestedShiftId: string;
    requestedShift: ShiftData;
  } | null;
  futureShiftAdjustments: Array<{
    date: string;
    shift: ShiftData;
  }>;
  approvedOvertime: ApprovedOvertime | null;
  futureApprovedOvertimes: ApprovedOvertime[];
}

export interface potentialOvertime {
  start: string;
  end: string;
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
  userId: string;
  date: Date;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  overtimeStartTime: Date | null;
  overtimeEndTime: Date | null;
  checkInLocation: Location | null;
  checkOutLocation: Location | null;
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

export interface ShiftAdjustment {
  id: string;
  userId: string;
  requestedShiftId: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  createdAt: Date;
  updatedAt: Date;
  requestedShift: Shift;
}

export interface FutureShiftAdjustment {
  date: string;
  shift: ShiftData;
}

export interface OvertimeApproval {
  id: string;
  userId: string;
  date: Date;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export interface ShiftAdjustmentRequestData {
  id: string;
  userId: string;
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
  userId: string;
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
  userId: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  reason: string;
}

export interface UserWithShift extends User {
  shift: Shift;
}

export interface CheckInFormData {
  userId: string;
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
  user_serial: number | string;
  user_no: string;
  user_fname?: string;
  user_lname?: string;
  user_photo: string;
}

export interface ExternalCheckInData {
  sj: string;
  user_serial: number | string;
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
  jlzp_serial: number | null;
  gly_no: string | null;
  lx: number;
  shenhe: number;
  yich: number;
  deal_state: number;
  dev_logic_bh: number | null;
  healthstatus: number | null;
  body_temp: string | null;
  temp_error: string | null;
  passport_no: string | null;
  date: string;
  time: string;
  noti: number;
  flagmax: number;
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
  userId: string;
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

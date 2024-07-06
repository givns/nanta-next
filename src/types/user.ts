import {
  User,
  Attendance,
  Shift,
  ShiftAdjustmentRequest,
} from '@prisma/client';
import { UserRole } from '@/types/enum';
export interface UserData {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeId: string;
  role: UserRole;
  shiftId: string;
  assignedShift?: Shift;
  profilePictureUrl: string | null;
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
}

export interface AttendanceStatus {
  user: {
    id: string;
    employeeId: string;
    name: string;
    assignedShift: Shift;
  };
  latestAttendance: Attendance | null;
  isCheckingIn: boolean;
  shiftAdjustment: (ShiftAdjustmentRequest & { requestedShift: Shift }) | null;
}

export interface ShiftData {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface ShiftAdjustment {
  id: string;
  userId: string;
  requestedShiftId: string;
  date: Date;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export interface OvertimeApproval {
  id: string;
  userId: string;
  date: Date;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export interface ShiftAdjustmentRequestData {
  userId: string;
  requestedShiftId: string;
  date: string;
  reason: string;
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

export interface ExternalCheckInData {
  sj: string;
  user_serial: number;
  user_no: string;
  user_fname: string;
  user_lname: string;
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
}

export interface CheckOutData {
  attendanceId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  deviceSerial?: string;
}

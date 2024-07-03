// types/user.ts

import {
  UserRole as PrismaUserRole,
  Attendance as PrismaAttendance,
} from '@prisma/client';

export type UserRole = PrismaUserRole;
export type Attendance = PrismaAttendance;

export interface UserData {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeId: string;
  role: UserRole;
  profilePictureUrl: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface AttendanceStatus {
  user: UserData;
  latestAttendance: Attendance | null;
  isCheckingIn: boolean;
}

export interface AttendanceData {
  userId: string;
  employeeId: string;
  checkTime: string;
  location: { lat: number; lng: number };
  address: string;
  reason?: string;
  photo?: string;
  deviceSerial: string;
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
  bh: number;
  fx: number | null;
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

// New interfaces for AttendanceService
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

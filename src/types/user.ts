import { Prisma } from '@prisma/client';

export enum UserRole {
  DRIVER = 'DRIVER',
  OPERATION = 'OPERATION',
  GENERAL = 'GENERAL',
  ADMIN = 'ADMIN',
  SUPERADMIN = 'SUPERADMIN',
}
export interface UserData {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeId: string;
  profilePictureUrl: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface Location {
  lat: number;
  lng: number;
}

// Updated to match the new unified Attendance model
export interface Attendance {
  id: string;
  userId: string;
  checkInTime: Date;
  checkOutTime: Date | null;
  checkInLocation: Prisma.JsonValue;
  checkOutLocation: Prisma.JsonValue | null;
  checkInAddress: string;
  checkOutAddress: string | null;
  checkInReason: string | null;
  checkOutReason: string | null;
  checkInPhoto: string;
  checkOutPhoto: string | null;
  checkInDeviceSerial: string | null;
  checkOutDeviceSerial: string | null;
  source: string;
  externalCheckId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeNumber: string;
  role: string;
  profilePictureUrl: string;
  createdAt: Date;
}

export interface CheckInFormData {
  userId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  timestamp: string;
  deviceSerial?: string;
}

export interface CheckOutFormData {
  attendanceId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  timestamp: string;
  deviceSerial?: string;
}

export interface ExternalCheckData {
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

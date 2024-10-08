// types/user.ts

import { User, Shift } from '@prisma/client';
import { UserRole } from './enum';
import {
  PotentialOvertime,
  ShiftData,
  AttendanceStatusInfo,
  AttendanceRecord,
} from './attendance';

export type { User, Shift };

export interface UserData {
  employeeId: string;
  name: string;
  lineUserId: string | null;
  nickname: string | null;
  departmentId: string | null;
  departmentName: string;
  role: UserRole;
  profilePictureUrl: string | null;
  shiftId: string | null;
  shiftCode: string | null;
  overtimeHours: number;
  potentialOvertimes: PotentialOvertime[];
  sickLeaveBalance: number;
  businessLeaveBalance: number;
  annualLeaveBalance: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserResponse {
  user: UserData;
  attendanceStatus: AttendanceStatusInfo;
  recentAttendance: AttendanceRecord[];
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  overtimeHours: number;
  balanceLeave: number;
}

export interface UserWithShift extends User {
  shift: Shift;
}

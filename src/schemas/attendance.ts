import { z } from 'zod';
import { UserRole } from '@/types/enum';
import { UserData } from '@/types/user';

const parseUserData = (userData: z.infer<typeof UserDataSchema>): UserData => ({
  ...userData,
  createdAt: userData.createdAt ? new Date(userData.createdAt) : undefined,
  updatedAt: userData.updatedAt ? new Date(userData.updatedAt) : undefined,
});

const UserDataSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  lineUserId: z.string().nullable(),
  nickname: z.string().nullable(),
  departmentId: z.string().nullable(),
  departmentName: z.string(),
  role: z.nativeEnum(UserRole),
  profilePictureUrl: z.string().nullable(),
  shiftId: z.string().nullable(),
  shiftCode: z.string().nullable(),
  overtimeHours: z.number(),
  potentialOvertimes: z.array(z.any()).optional().default([]),
  sickLeaveBalance: z.number(),
  businessLeaveBalance: z.number(),
  annualLeaveBalance: z.number(),
  createdAt: z.string().or(z.date()).nullable().optional(),
  updatedAt: z.string().or(z.date()).nullable().optional(),
});

const ShiftDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  shiftCode: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workDays: z.array(z.number()),
});

const AttendanceStatusInfoSchema = z
  .object({
    status: z.enum(['present', 'absent', 'incomplete', 'holiday', 'off']),
    isOvertime: z.boolean(),
    overtimeDuration: z.number().nonnegative().default(0),
    detailedStatus: z.string(),
    isEarlyCheckIn: z.boolean(),
    isLateCheckIn: z.boolean(),
    isLateCheckOut: z.boolean(),
    user: UserDataSchema,
    latestAttendance: z
      .object({
        id: z.string(),
        employeeId: z.string(),
        date: z.string(),
        checkInTime: z.string().nullable(),
        checkOutTime: z.string().nullable(),
        status: z.enum([
          'checked-in',
          'checked-out',
          'overtime-started',
          'overtime-ended',
          'pending',
          'approved',
          'denied',
        ]),
        isManualEntry: z.boolean(),
      })
      .nullable(),
    isCheckingIn: z.boolean(),
    isDayOff: z.boolean(),
    potentialOvertimes: z.array(z.any()), // Define a more specific schema if possible
    shiftAdjustment: z
      .object({
        date: z.string(),
        requestedShiftId: z.string(),
        requestedShift: ShiftDataSchema,
      })
      .nullable(),
    approvedOvertime: z.any().nullable(),
    futureShifts: z.array(
      z.object({
        date: z.string(),
        shift: ShiftDataSchema,
      }),
    ),
    futureOvertimes: z.array(z.any()), // You might want to define a more specific schema for ApprovedOvertime
    pendingLeaveRequest: z.boolean(),
  })
  .transform((data) => ({
    ...data,
    user: parseUserData(data.user),
    approvedOvertime: data.approvedOvertime || null,
  }));

const CheckInOutAllowanceSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  isLate: z.boolean().optional(),
  isOvertime: z.boolean().optional(),
});

const UpdatedResponseDataSchema = z.object({
  user: UserDataSchema,
  attendanceStatus: AttendanceStatusInfoSchema.nullable(),
  effectiveShift: ShiftDataSchema.nullable(),
  checkInOutAllowance: CheckInOutAllowanceSchema,
  approvedOvertime: z.any().nullable(),
});

export {
  AttendanceStatusInfoSchema,
  UpdatedResponseDataSchema as ResponseDataSchema,
  UserDataSchema,
  ShiftDataSchema,
  parseUserData,
};

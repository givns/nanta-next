import { z } from 'zod';
import { UserRole } from '@/types/enum';
import { UserData } from '@/types/user';

// Parse function for UserData
const parseUserData = (userData: z.infer<typeof UserDataSchema>): UserData => ({
  ...userData,
  updatedAt: userData.updatedAt ? new Date(userData.updatedAt) : undefined,
});

// Schema for UserData
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
  sickLeaveBalance: z.number(),
  businessLeaveBalance: z.number(),
  annualLeaveBalance: z.number(),
  updatedAt: z.string().or(z.date()).nullable().optional(),
});

// Schema for ShiftData
const ShiftDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  shiftCode: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workDays: z.array(z.number()),
});

// Schema for ApprovedOvertime
const ApprovedOvertimeSchema = z
  .object({
    id: z.string(),
    employeeId: z.string(),
    date: z.string().or(z.date()),
    startTime: z.string(),
    endTime: z.string(),
    status: z.string(),
    reason: z.string().nullable(),
    isDayOffOvertime: z.boolean(),
    actualStartTime: z.string().or(z.date()).nullable(), // Mark as nullable
    actualEndTime: z.string().or(z.date()).nullable(), // Mark as nullable
    approvedBy: z.string().nullable(), // Mark as nullable
    approvedAt: z.string().or(z.date()).nullable(), // Mark as nullable
    name: z.string().optional(),
    employeeResponse: z.string().optional(),
    approverId: z.string().optional(),
    createdAt: z.string().or(z.date()).optional(),
    updatedAt: z.string().or(z.date()).optional(),
  })
  .nullable();

// Schema for OvertimeEntryData
const OvertimeEntryDataSchema = z.object({
  id: z.string(),
  attendanceId: z.string(),
  overtimeRequestId: z.string(),
  actualStartTime: z.string().or(z.date()),
  actualEndTime: z.string().or(z.date()).nullable(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

// Schema for AttendanceStatusInfo
const AttendanceStatusInfoSchema = z
  .object({
    status: z.enum([
      'present',
      'absent',
      'incomplete',
      'holiday',
      'off',
      'overtime',
    ]),
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
    isHoliday: z.boolean(),
    holidayInfo: z
      .object({
        localName: z.string(),
        name: z.string(),
        date: z.string(),
      })
      .nullable(),
    dayOffType: z.enum(['holiday', 'weekly', 'none']),
    potentialOvertimes: z.array(OvertimeEntryDataSchema).optional(), // Use the defined OvertimeEntryData schema
    shiftAdjustment: z
      .object({
        date: z.string(),
        requestedShiftId: z.string(),
        requestedShift: ShiftDataSchema,
      })
      .nullable(),
    approvedOvertime: ApprovedOvertimeSchema,
    futureShifts: z.array(
      z.object({
        date: z.string(),
        shift: ShiftDataSchema,
      }),
    ),
    futureOvertimes: z.array(ApprovedOvertimeSchema).optional(), // Using the ApprovedOvertimeSchema
    pendingLeaveRequest: z.boolean(),
  })
  .transform((data) => ({
    ...data,
    user: parseUserData(data.user),
    approvedOvertime: data.approvedOvertime || null,
  }));

// Schema for CheckInOutAllowance
const CheckInOutAllowanceSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  isLate: z.boolean().optional(),
  isOvertime: z.boolean().optional(),
  isAfternoonShift: z.boolean().optional(), // Add this line
});

// Schema for LeaveRequestData
const LeaveRequestSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  leaveType: z.string(),
  leaveFormat: z.string(),
  reason: z.string(),
  startDate: z
    .string()
    .or(z.date())
    .transform((date) =>
      typeof date === 'string' ? date : date.toISOString(),
    ),
  endDate: z
    .string()
    .or(z.date())
    .transform((date) =>
      typeof date === 'string' ? date : date.toISOString(),
    ),
  fullDayCount: z.number(),
  status: z.string(),
});

// A helper function to transform dates in the response data
const transformDates = (data: any) => {
  if (!data) return data;

  const transformed = { ...data };
  if (transformed.startDate instanceof Date) {
    transformed.startDate = transformed.startDate.toISOString();
  }
  if (transformed.endDate instanceof Date) {
    transformed.endDate = transformed.endDate.toISOString();
  }
  return transformed;
};

// Updated Response Data Schema
const UpdatedResponseDataSchema = z.object({
  user: UserDataSchema,
  attendanceStatus: AttendanceStatusInfoSchema.nullable(),
  effectiveShift: ShiftDataSchema.nullable(),
  checkInOutAllowance: CheckInOutAllowanceSchema,
  approvedOvertime: ApprovedOvertimeSchema.nullable(),
  leaveRequests: z
    .array(LeaveRequestSchema)
    .transform((requests) => requests.map(transformDates)),
});

export {
  AttendanceStatusInfoSchema,
  UpdatedResponseDataSchema as ResponseDataSchema,
  UserDataSchema,
  ShiftDataSchema,
  parseUserData,
};

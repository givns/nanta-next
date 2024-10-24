// schemas/attendance.ts
import { z } from 'zod';
import { UserRole } from '@/types/enum';
import { UserData } from '@/types/user';

// Utility function for date handling
const DateStringOrDate = z
  .union([z.string(), z.date()])
  .transform((val) => (typeof val === 'string' ? new Date(val) : val));

// Base User Schema
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
  updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
});

// Shift Schema
const ShiftDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  shiftCode: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workDays: z.array(z.number()),
});

// Time Entry Schema
const TimeEntrySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  date: DateStringOrDate,
  startTime: DateStringOrDate,
  endTime: DateStringOrDate.nullable(),
  regularHours: z.number(),
  overtimeHours: z.number(),
  actualMinutesLate: z.number(),
  isHalfDayLate: z.boolean(),
  status: z.enum(['in_progress', 'completed']),
  attendanceId: z.string().nullable(),
  overtimeRequestId: z.string().nullable(),
  entryType: z.enum(['regular', 'overtime']),
});

// Attendance Related Schemas
const OvertimeEntrySchema = z.object({
  id: z.string(),
  attendanceId: z.string(),
  overtimeRequestId: z.string(),
  actualStartTime: DateStringOrDate,
  actualEndTime: DateStringOrDate.nullable(),
});

const AttendanceSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  date: DateStringOrDate,
  isDayOff: z.boolean(),
  shiftStartTime: DateStringOrDate.nullable(),
  shiftEndTime: DateStringOrDate.nullable(),
  regularCheckInTime: DateStringOrDate.nullable(),
  regularCheckOutTime: DateStringOrDate.nullable(),
  isEarlyCheckIn: z.boolean().nullable(),
  isLateCheckIn: z.boolean().nullable(),
  isLateCheckOut: z.boolean().nullable(),
  isVeryLateCheckOut: z.boolean(),
  lateCheckOutMinutes: z.number(),
  checkInLocation: z.any().nullable(),
  checkOutLocation: z.any().nullable(),
  checkInAddress: z.string().nullable(),
  checkOutAddress: z.string().nullable(),
  checkInReason: z.string().nullable(),
  checkInPhoto: z.string().nullable(),
  checkOutPhoto: z.string().nullable(),
  status: z.enum(['checked-in', 'checked-out', 'incomplete']),
  isManualEntry: z.boolean(),
  timeEntries: z.array(TimeEntrySchema).optional(),
  version: z.number(),
});

// Overtime Schemas
const ApprovedOvertimeSchema = z
  .object({
    id: z.string(),
    employeeId: z.string(),
    date: DateStringOrDate,
    startTime: z.string(),
    endTime: z.string(),
    status: z.string(),
    reason: z.string().nullable(),
    isDayOffOvertime: z.boolean(),
    actualStartTime: z
      .union([z.string(), z.date(), z.null()])
      .nullable()
      .optional(),
    actualEndTime: z
      .union([z.string(), z.date(), z.null()])
      .nullable()
      .optional(),
    approvedBy: z.string().nullable().optional(),
    approvedAt: z.union([z.string(), z.date(), z.null()]).nullable().optional(),
    name: z.string().optional(),
    employeeResponse: z.string().nullable().optional(),
    approverId: z.string().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z
      .union([z.string(), z.date()])
      .optional()
      .transform((val) => (val ? new Date(val) : undefined)),
  })
  .nullable();

// Holiday Schema
const HolidayInfoSchema = z
  .object({
    localName: z.string(),
    name: z.string(),
    date: z.string(),
  })
  .nullable();

// Leave Request Schema
const LeaveRequestSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  leaveType: z.string(),
  leaveFormat: z.string(),
  reason: z.string(),
  startDate: DateStringOrDate,
  endDate: DateStringOrDate,
  fullDayCount: z.number(),
  status: z.string(),
});

// Status Schemas
const AttendanceStatusTypeSchema = z.enum([
  'checked-in',
  'checked-out',
  'overtime-started',
  'overtime-ended',
  'pending',
  'approved',
  'day-off',
]);

const AttendanceStatusValueSchema = z.enum([
  'present',
  'absent',
  'incomplete',
  'holiday',
  'off',
  'overtime',
]);

// Comprehensive Status Info Schema
const AttendanceStatusInfoSchema = z.object({
  status: AttendanceStatusValueSchema,
  isOvertime: z.boolean(),
  overtimeDuration: z.number().default(0),
  overtimeEntries: z.array(OvertimeEntrySchema),
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
      status: AttendanceStatusTypeSchema,
      isManualEntry: z.boolean(),
    })
    .nullable(),
  isCheckingIn: z.boolean(),
  isDayOff: z.boolean(),
  isHoliday: z.boolean(),
  holidayInfo: HolidayInfoSchema,
  dayOffType: z.enum(['holiday', 'weekly', 'none']),
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
  futureOvertimes: z.array(ApprovedOvertimeSchema).optional(),
  pendingLeaveRequest: z.boolean(),
});

// Check-in/out Allowance Schema
const CheckInOutAllowanceSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  inPremises: z.boolean(),
  address: z.string(),
  isLate: z.boolean().optional(),
  isOvertime: z.boolean().optional(),
  countdown: z.number().optional(),
  isOutsideShift: z.boolean().optional(),
  isDayOffOvertime: z.boolean().optional(),
  isPendingDayOffOvertime: z.boolean().optional(),
  isPendingOvertime: z.boolean().optional(),
  requireConfirmation: z.boolean().optional(),
  isEarlyCheckIn: z.boolean().optional(),
  isEarlyCheckOut: z.boolean().optional(),
  isLateCheckIn: z.boolean().optional(),
  isLateCheckOut: z.boolean().optional(),
  isVeryLateCheckOut: z.boolean().optional(),
  lateCheckOutMinutes: z.number().optional(),
  isPotentialOvertime: z.boolean().optional(),
  isAfternoonShift: z.boolean().optional(),
  isMorningShift: z.boolean().optional(),
  isApprovedEarlyCheckout: z.boolean().optional(),
});

// Complete Response Schema
const ResponseDataSchema = z.object({
  user: z.object({
    id: z.string(),
    employeeId: z.string(),
    name: z.string(),
    lineUserId: z.string().nullable(),
    nickname: z.string().nullable(),
    departmentName: z.string(),
    departmentId: z.string().nullable(),
    role: z.string(),
    company: z.string().nullable(),
    employeeType: z.enum(['Probation', 'Fulltime', 'Parttime']),
    isGovernmentRegistered: z.string(),
    profilePictureUrl: z.string().nullable(),
    shiftId: z.string().nullable(),
    shiftCode: z.string().nullable(),
    overtimeHours: z.number(),
    sickLeaveBalance: z.number(),
    businessLeaveBalance: z.number(),
    annualLeaveBalance: z.number(),
    isPreImported: z.string(),
    isRegistrationComplete: z.string(),
    updatedAt: z
      .union([z.string(), z.date()])
      .nullable()
      .transform((val) => (val ? new Date(val) : null)),
  }),
  attendanceStatus: AttendanceStatusInfoSchema.nullable(),
  effectiveShift: ShiftDataSchema.nullable(),
  checkInOutAllowance: CheckInOutAllowanceSchema,
  approvedOvertime: ApprovedOvertimeSchema,
  leaveRequests: z.array(LeaveRequestSchema),
});

// Helper function to safely transform dates
const transformDates = (data: any) => {
  if (!data) return data;
  return {
    ...data,
    date: data.date instanceof Date ? data.date.toISOString() : data.date,
    actualStartTime:
      data.actualStartTime instanceof Date
        ? data.actualStartTime.toISOString()
        : data.actualStartTime,
    actualEndTime:
      data.actualEndTime instanceof Date
        ? data.actualEndTime.toISOString()
        : data.actualEndTime,
    approvedAt:
      data.approvedAt instanceof Date
        ? data.approvedAt.toISOString()
        : data.approvedAt,
  };
};

// Parse function for UserData
const parseUserData = (userData: z.infer<typeof UserDataSchema>): UserData => ({
  ...userData,
  updatedAt: userData.updatedAt ? new Date(userData.updatedAt) : undefined,
});

export {
  ResponseDataSchema,
  AttendanceStatusInfoSchema,
  UserDataSchema,
  ShiftDataSchema,
  TimeEntrySchema,
  ApprovedOvertimeSchema,
  LeaveRequestSchema,
  CheckInOutAllowanceSchema,
  parseUserData,
  transformDates,
  DateStringOrDate,
};

import { z } from 'zod';
import { UserRole } from '@/types/enum';
import { UserData } from '@/types/user';

// Parse function for UserData
const parseUserData = (userData: z.infer<typeof UserDataSchema>): UserData => ({
  ...userData,
  updatedAt: userData.updatedAt ? new Date(userData.updatedAt) : undefined,
});

// Base schemas for common fields
const DateStringOrDate = z
  .union([z.string(), z.date()])
  .transform((val) => (typeof val === 'string' ? new Date(val) : val));

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

// Status info schemas
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

const HolidayInfoSchema = z
  .object({
    localName: z.string(),
    name: z.string(),
    date: z.string(),
  })
  .nullable();

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
  checkInLocation: z.any().nullable(), // Json type
  checkOutLocation: z.any().nullable(), // Json type
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

const OvertimeEntrySchema = z.object({
  id: z.string(),
  attendanceId: z.string(),
  overtimeRequestId: z.string(),
  actualStartTime: DateStringOrDate,
  actualEndTime: DateStringOrDate.nullable(),
});

// Schema for ApprovedOvertime
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
    approvedBy: z.string().nullable().optional(), // Made optional and nullable
    approvedAt: z.union([z.string(), z.date(), z.null()]).nullable().optional(),
    name: z.string().optional(),
    employeeResponse: z.string().optional(),
    approverId: z.string().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z.union([z.string(), z.date()]).optional(),
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
const AttendanceStatusInfoSchema = z.object({
  status: AttendanceStatusValueSchema,
  isOvertime: z.boolean(),
  overtimeDuration: z.number().default(0),
  overtimeEntries: z.array(OvertimeEntrySchema),
  detailedStatus: z.string(),
  isEarlyCheckIn: z.boolean(),
  isLateCheckIn: z.boolean(),
  isLateCheckOut: z.boolean(),
  user: z.object({
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
  }),
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

// Helper function to safely transform dates
const transformDates = (data: any) => {
  try {
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
  } catch (error) {
    console.error('Error transforming dates:', error);
    return data;
  }
};

// Updated Response Data Schema
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
    updatedAt: z.date().nullable(),
  }),
  attendanceStatus: z
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
      overtimeDuration: z.number(),
      overtimeEntries: z.array(
        z.object({
          id: z.string(),
          attendanceId: z.string(),
          overtimeRequestId: z.string(),
          actualStartTime: z.date(),
          actualEndTime: z.date().nullable(),
        }),
      ),
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
            'day-off',
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
      shiftAdjustment: z
        .object({
          date: z.string(),
          requestedShiftId: z.string(),
          requestedShift: ShiftDataSchema,
        })
        .nullable(),
      approvedOvertime: z
        .object({
          id: z.string(),
          employeeId: z.string(),
          date: z.date(),
          startTime: z.string(),
          endTime: z.string(),
          status: z.string(),
          reason: z.string().nullable(),
          isDayOffOvertime: z.boolean(),
          actualStartTime: z.date().nullable(),
          actualEndTime: z.date().nullable(),
          approvedBy: z.string().nullable(),
          approvedAt: z.date().nullable(),
          employeeResponse: z.string().nullable(),
          name: z.string().optional(),
          updatedAt: z.date().optional(),
        })
        .nullable(),
      futureShifts: z.array(
        z.object({
          date: z.string(),
          shift: ShiftDataSchema,
        }),
      ),
      futureOvertimes: z
        .array(
          z.object({
            id: z.string(),
            date: z.date(),
            startTime: z.string(),
            endTime: z.string(),
            status: z.string(),
            reason: z.string().nullable(),
            isDayOffOvertime: z.boolean(),
          }),
        )
        .optional(),
      pendingLeaveRequest: z.boolean(),
    })
    .nullable(),
  effectiveShift: ShiftDataSchema.nullable(),
  checkInOutAllowance: z.object({
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
  }),
  approvedOvertime: z
    .object({
      id: z.string(),
      employeeId: z.string(),
      date: z.date(),
      startTime: z.string(),
      endTime: z.string(),
      status: z.string(),
      reason: z.string().nullable(),
      isDayOffOvertime: z.boolean(),
      actualStartTime: z.date().nullable(),
      actualEndTime: z.date().nullable(),
      approvedBy: z.string().nullable(),
      approvedAt: z.date().nullable(),
    })
    .nullable(),
  leaveRequests: z.array(
    z.object({
      id: z.string(),
      employeeId: z.string(),
      leaveType: z.string(),
      leaveFormat: z.string(),
      reason: z.string(),
      startDate: z.date(),
      endDate: z.date(),
      fullDayCount: z.number(),
      status: z.string(),
    }),
  ),
});

export {
  AttendanceStatusInfoSchema,
  ResponseDataSchema,
  UserDataSchema,
  ShiftDataSchema,
  parseUserData,
};

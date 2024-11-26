// schemas/attendance.ts
import { z } from 'zod';
import { UserRole } from '@/types/enum';
import { ProcessingOptions } from '@/types/attendance/processing';
import { ErrorCode, AppError } from '@/types/attendance/error';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@/types/attendance/status';
import { normalizeLocation } from '@/utils/locationUtils';

// ============= Constants =============
export const EARLY_CHECKOUT_TYPES = {
  emergency: 'emergency',
  planned: 'planned',
} as const;

// ============= Base Schemas =============
const DateStringOrDate = z
  .union([z.string(), z.date()])
  .transform((val) => (typeof val === 'string' ? new Date(val) : val));

// ============= Enum Schemas =============

export const AttendanceStateSchema = z.enum([
  'present', // matches AttendanceState.PRESENT
  'absent', // matches AttendanceState.ABSENT
  'incomplete', // matches AttendanceState.INCOMPLETE
  'holiday', // matches AttendanceState.HOLIDAY
  'off', // matches AttendanceState.OFF
  'overtime', // matches AttendanceState.OVERTIME
]);

export const CheckStatusSchema = z.enum([
  'checked-in', // matches CheckStatus.CHECKED_IN
  'checked-out', // matches CheckStatus.CHECKED_OUT
  'pending', // matches CheckStatus.PENDING
]);

export const OvertimeStateSchema = z.enum([
  'not-started', // matches OvertimeState.NOT_STARTED
  'overtime-started', // matches OvertimeState.IN_PROGRESS
  'overtime-ended', // matches OvertimeState.COMPLETED
]);

export const PeriodTypeSchema = z.enum(['regular', 'overtime']);

export const TimeEntryStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED']);

export const ApprovalStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

// ============= Core Schemas =============
// Schema matching Location type
export const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  timestamp: DateStringOrDate.optional(),
  provider: z.string().optional(),
});

// Schema matching Metadata type
export const MetadataSchema = z.object({
  version: z.number(),
  isManualEntry: z.boolean().optional(),
  reason: z.string().optional(),
  photo: z.string().optional(),
  lastModifiedBy: z.string().optional(),
  lastModifiedAt: DateStringOrDate.optional(),
  source: z.string().optional(),
});

// Then export types inferred from schemas
export const CheckoutStatusSchema = z.enum([
  'very_early',
  'early',
  'normal',
  'late',
]);

export const UserDataSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  lineUserId: z.string().nullable(),
  nickname: z.string().nullable().optional(), // Make both nullable and optional
  departmentName: z.string(),
  role: z.nativeEnum(UserRole),
  profilePictureUrl: z.string().nullable(),
  shiftId: z.string().nullable(),
  shiftCode: z.string().nullable(),
  sickLeaveBalance: z.number(),
  businessLeaveBalance: z.number(),
  annualLeaveBalance: z.number(),
  updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
  id: z.string().optional(),
  company: z.string().nullable().optional(),
  employeeType: z.enum(['Probation', 'Fulltime', 'Parttime']).optional(),
  isGovernmentRegistered: z.string().optional(),
  isPreImported: z.string().optional(),
  isRegistrationComplete: z.string().optional(),
});

export const ShiftDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  shiftCode: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workDays: z.array(z.number()),
});

export const TimeWindowSchema = z.object({
  start: DateStringOrDate,
  end: DateStringOrDate,
  isFlexible: z.boolean().optional(),
  gracePeriod: z.number().optional(),
});

export const ShiftWindowsSchema = z.object({
  shiftStart: DateStringOrDate,
  shiftEnd: DateStringOrDate,
  earlyWindow: DateStringOrDate,
  lateWindow: DateStringOrDate,
  overtimeWindow: DateStringOrDate,
});

export const AttendanceCompositeStatusSchema = z.object({
  state: AttendanceStateSchema,
  checkStatus: CheckStatusSchema,
  isOvertime: z.boolean(),
  overtimeState: OvertimeStateSchema.optional(),
  overtimeDuration: z.number().optional(),
});

export const CurrentPeriodInfoSchema = z.object({
  type: PeriodTypeSchema,
  overtimeId: z.string().optional(),
  checkInTime: z.string().nullable(),
  checkOutTime: z.string().nullable(),
  isComplete: z.boolean(),
  current: z.object({
    start: DateStringOrDate,
    end: DateStringOrDate,
  }),
});

export const TimeEntrySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  date: DateStringOrDate,
  startTime: DateStringOrDate,
  endTime: DateStringOrDate.nullable(),
  status: TimeEntryStatusSchema,
  entryType: PeriodTypeSchema,
  regularHours: z.number(),
  overtimeHours: z.number(),
  attendanceId: z.string().nullable(),
  overtimeRequestId: z.string().nullable(),
  actualMinutesLate: z.number(),
  isHalfDayLate: z.boolean(),
  overtimeMetadata: z
    .object({
      isDayOffOvertime: z.boolean(),
      isInsideShiftHours: z.boolean(),
    })
    .optional(),
});

export const OvertimeEntrySchema = z.object({
  id: z.string(),
  attendanceId: z.string(),
  overtimeRequestId: z.string(),
  actualStartTime: DateStringOrDate,
  actualEndTime: DateStringOrDate.nullable(),
});

export const ApprovedOvertimeSchema = z
  .object({
    id: z.string(),
    employeeId: z.string(),
    date: DateStringOrDate,
    startTime: z.string(),
    endTime: z.string(),
    durationMinutes: z.number(),
    status: z.enum([
      'pending_response',
      'pending',
      'approved',
      'rejected',
      'declined_by_employee',
    ]),
    reason: z.string().nullable(),
    isDayOffOvertime: z.boolean(),
    isInsideShiftHours: z.boolean(),
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
    approverId: z.string().nullable().optional(),
    createdAt: z.union([z.string(), z.date()]),
    updatedAt: z
      .union([z.string(), z.date()])
      .transform((val) => (val ? new Date(val) : undefined)),
  })
  .nullable();

export const HolidayInfoSchema = z
  .object({
    localName: z.string(),
    name: z.string(),
    date: z.string(),
  })
  .nullable();

export const LeaveRequestSchema = z.object({
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

export const LatestAttendanceSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  date: z.string(),
  regularCheckInTime: z.string().nullable(),
  regularCheckOutTime: z.string().nullable(),
  state: z.nativeEnum(AttendanceState),
  checkStatus: z.nativeEnum(CheckStatus),
  overtimeState: z.nativeEnum(OvertimeState).optional(),
  isManualEntry: z.boolean(),
  isDayOff: z.boolean(),
  shiftStartTime: z.string().optional(),
  shiftEndTime: z.string().optional(),
});

export const AttendanceStatusInfoSchema = z.object({
  state: z.nativeEnum(AttendanceState),
  checkStatus: z.nativeEnum(CheckStatus),
  overtimeState: z.nativeEnum(OvertimeState).optional(),
  isOvertime: z.boolean().optional(),
  overtimeDuration: z.number().optional().default(0),
  overtimeEntries: z.array(OvertimeEntrySchema).default([]),
  detailedStatus: z.string(),
  isEarlyCheckIn: z.boolean(),
  isLateCheckIn: z.boolean(),
  isLateCheckOut: z.boolean(),
  user: UserDataSchema,
  latestAttendance: LatestAttendanceSchema.nullable(),
  isCheckingIn: z.boolean(),
  isDayOff: z.boolean(),
  isHoliday: z.boolean(),
  holidayInfo: HolidayInfoSchema.nullable().optional(),
  dayOffType: z.enum(['holiday', 'weekly', 'none']),
  isOutsideShift: z.boolean(),
  isLate: z.boolean(),
  shiftAdjustment: z
    .object({
      date: z.string(),
      requestedShiftId: z.string(),
      requestedShift: ShiftDataSchema,
    })
    .nullable(),
  approvedOvertime: ApprovedOvertimeSchema.nullable(),
  allApprovedOvertimes: z.array(ApprovedOvertimeSchema).optional(),
  futureShifts: z.array(
    z.object({
      date: z.string(),
      shift: ShiftDataSchema,
    }),
  ),
  futureOvertimes: z.array(ApprovedOvertimeSchema),
  overtimeAttendances: z.array(
    z.object({
      overtimeRequest: z.object({
        id: z.string(),
        employeeId: z.string(),
        date: DateStringOrDate,
        startTime: z.string(),
        endTime: z.string(),
        durationMinutes: z.number(),
        status: z.enum([
          'pending_response',
          'pending',
          'approved',
          'rejected',
          'declined_by_employee',
        ]),
        reason: z.string().nullable(),
        isDayOffOvertime: z.boolean(),
        isInsideShiftHours: z.boolean(),
        employeeResponse: z.string().nullable(),
        approverId: z.string().nullable(),
      }),
      attendanceTime: z
        .object({
          checkInTime: z.string().nullable(),
          checkOutTime: z.string().nullable(),
          checkStatus: z.nativeEnum(CheckStatus), // Changed from status
          isOvertime: z.boolean(),
          overtimeState: z.nativeEnum(OvertimeState),
        })
        .nullable(),
      periodStatus: z.object({
        isPending: z.boolean(),
        isActive: z.boolean(),
        isNext: z.boolean(),
        isComplete: z.boolean(),
      }),
    }),
  ),
  currentPeriod: z.object({
    type: z.nativeEnum(PeriodType),
    overtimeId: z.string().optional(),
    isComplete: z.boolean(),
    checkInTime: z.string().nullable().optional(),
    checkOutTime: z.string().nullable().optional(),
    current: z.object({
      start: DateStringOrDate,
      end: DateStringOrDate,
    }),
  }),
  nextPeriod: z
    .object({
      type: z.nativeEnum(PeriodType),
      startTime: z.string(),
      overtimeId: z.string().optional(),
    })
    .optional(),
  pendingLeaveRequest: z.boolean(),
});

export const CheckInOutAllowanceSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  inPremises: z.boolean(),
  address: z.string(),
  periodType: PeriodTypeSchema,
  isLastPeriod: z.boolean(),
  requireConfirmation: z.boolean().optional(),
  flags: z.object({
    isOvertime: z.boolean().optional(),
    isDayOffOvertime: z.boolean().optional(),
    isPendingDayOffOvertime: z.boolean().optional(),
    isPendingOvertime: z.boolean().optional(),
    isOutsideShift: z.boolean().optional(),
    isInsideShift: z.boolean().optional(),
    isLate: z.boolean().optional(),
    isEarlyCheckIn: z.boolean().optional(),
    isEarlyCheckOut: z.boolean().optional(),
    isLateCheckIn: z.boolean().optional(),
    isLateCheckOut: z.boolean().optional(),
    isVeryLateCheckOut: z.boolean().optional(),
    isAutoCheckIn: z.boolean().optional(),
    isAutoCheckOut: z.boolean().optional(),
    isAfternoonShift: z.boolean().optional(),
    isMorningShift: z.boolean().optional(),
    isAfterMidshift: z.boolean().optional(),
    isApprovedEarlyCheckout: z.boolean().optional(),
    isPlannedHalfDayLeave: z.boolean().optional(),
    isEmergencyLeave: z.boolean().optional(),
  }),
  timing: z.object({
    countdown: z.number().optional(),
    lateCheckOutMinutes: z.number().optional(),
    minutesEarly: z.number().optional(),
    missedCheckInTime: z.number().optional(),
    checkoutStatus: CheckoutStatusSchema.optional(),
    earlyCheckoutType: z.enum(['emergency', 'planned']).optional(),
    actualStartTime: z.string().optional(),
    actualEndTime: z.string().optional(),
    plannedStartTime: z.string().optional(),
    plannedEndTime: z.string().optional(),
    maxCheckOutTime: z.string().optional(),
  }),
  metadata: z.object({
    overtimeId: z.string().optional(),
    nextPeriod: z
      .object({
        type: PeriodTypeSchema,
        startTime: z.string(),
        overtimeId: z.string().optional(),
      })
      .optional(),
  }),
});

export const AttendanceResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    attendance: z.object({
      id: z.string(),
      employeeId: z.string(),
      date: DateStringOrDate,
      state: AttendanceStateSchema,
      checkStatus: CheckStatusSchema,
      overtimeState: OvertimeStateSchema.optional(),
      regularCheckInTime: DateStringOrDate.nullable(),
      regularCheckOutTime: DateStringOrDate.nullable(),
    }),
    status: AttendanceCompositeStatusSchema,
    validation: z
      .object({
        isValid: z.boolean(),
        errors: z.array(
          z.object({
            code: z.string(),
            message: z.string(),
          }),
        ),
      })
      .optional(),
  }),
  metadata: z
    .object({
      processedAt: DateStringOrDate,
      version: z.number(),
    })
    .optional(),
});

// Request validation schema
export const CheckInOutRequestSchema = z
  .object({
    // Core identifiers (at least one required)
    employeeId: z.string().optional(),
    lineUserId: z.string().optional(),

    // Required fields
    isCheckIn: z.boolean(),
    checkTime: z.string(),
    address: z.string(),
    inPremises: z.boolean(),
    entryType: PeriodTypeSchema, // Added as required field

    // Optional fields with validation
    location: locationSchema.optional(),
    photo: z.string().optional(),
    reason: z.string().optional(),

    // Status fields
    isOvertime: z.boolean().optional(),
    isManualEntry: z.boolean().optional(),
    state: AttendanceStateSchema.optional(),
    checkStatus: CheckStatusSchema.optional(),
    overtimeState: OvertimeStateSchema.optional(),

    // Specific feature fields
    overtimeRequestId: z.string().optional(),
    earlyCheckoutType: z.enum(['emergency', 'planned']).optional(),

    // Processing metadata
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((data) => Boolean(data.employeeId || data.lineUserId), {
    message: 'Either employeeId or lineUserId must be provided',
    path: ['identification'],
  });

// ============= Helper Functions =============

export const cleanUserData = (
  userData: any,
): z.infer<typeof UserDataSchema> => {
  return {
    employeeId: userData.employeeId,
    name: userData.name,
    lineUserId: userData.lineUserId,
    nickname: userData.nickname,
    departmentName: userData.departmentName || '',
    role: userData.role,
    profilePictureUrl: userData.profilePictureUrl,
    shiftId: userData.shiftId,
    shiftCode: userData.shiftCode,
    sickLeaveBalance: userData.sickLeaveBalance || 0,
    businessLeaveBalance: userData.businessLeaveBalance || 0,
    annualLeaveBalance: userData.annualLeaveBalance || 0,
    updatedAt: userData.updatedAt,
    id: userData.id,
    company: userData.company,
    employeeType: userData.employeeType,
    isGovernmentRegistered: userData.isGovernmentRegistered,
    isPreImported: userData.isPreImported,
    isRegistrationComplete: userData.isRegistrationComplete,
  };
};

export const transformDates = (data: any) => {
  if (!data) return data;
  return {
    ...data,
    date: data.date instanceof Date ? data.toISOString() : data.date,
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

// ============= Validation Functions =============
export const validateCheckInOutAllowance = (data: unknown) => {
  return CheckInOutAllowanceSchema.parse(data);
};

export const validateAttendanceResponse = (data: unknown) => {
  return AttendanceResponseSchema.parse(data);
};

function transformZodErrors(zodErrors: z.ZodError): Record<string, unknown> {
  return {
    errors: zodErrors.errors.map((error) => {
      // Base error info
      const errorInfo: Record<string, unknown> = {
        path: error.path.join('.'),
        code: error.code,
        message: error.message,
      };

      // Add specific error details based on error type
      switch (error.code) {
        case 'invalid_type':
          errorInfo.expected = error.expected;
          errorInfo.received = error.received;
          break;
        case 'invalid_enum_value':
          errorInfo.expected = error.options;
          errorInfo.received = error.received;
          break;
        case 'custom':
          if (error.params) {
            errorInfo.params = error.params;
          }
          break;
        // Add other cases as needed
      }

      return errorInfo;
    }),
    errorCount: zodErrors.errors.length,
    _tag: 'ZodValidationError', // Add a tag to identify error type
  };
}

/**
 * Validates and transforms check-in/out request data into ProcessingOptions
 * @throws {AppError} If validation fails
 */
export function validateCheckInOutRequest(data: unknown): ProcessingOptions {
  try {
    // First level validation with Zod
    const validated = CheckInOutRequestSchema.parse(data);
    // Transform and normalize location data
    const transformedLocation = validated.location
      ? normalizeLocation(validated.location)
      : undefined;

    // Validate coordinates if location exists
    if (transformedLocation) {
      if (
        transformedLocation.lat < -90 ||
        transformedLocation.lat > 90 ||
        transformedLocation.lng < -180 ||
        transformedLocation.lng > 180
      ) {
        throw new AppError({
          code: ErrorCode.INVALID_INPUT,
          message: 'Invalid location coordinates',
        });
      }
    }

    // Transform to ProcessingOptions
    const processingOptions: ProcessingOptions = {
      // Core identifiers
      employeeId: validated.employeeId || '',
      lineUserId: validated.lineUserId,

      // Time information
      checkTime: new Date(validated.checkTime),

      // Check-in/out flags
      isCheckIn: validated.isCheckIn,
      isOvertime: validated.isOvertime || false,
      isManualEntry: validated.isManualEntry || false,

      // Status information - Convert string enums to proper enum values
      state: validated.state as AttendanceState | undefined,
      checkStatus: validated.checkStatus as CheckStatus | undefined,
      overtimeState: validated.overtimeState as OvertimeState | undefined,
      entryType: validated.entryType as PeriodType,
      // Location data
      location: transformedLocation,
      address: validated.address,

      // Additional data
      overtimeRequestId: validated.overtimeRequestId,
      reason: validated.reason,
      photo: validated.photo,

      // Metadata
      metadata: validated.metadata
        ? {
            inPremises: validated.inPremises,
            earlyCheckoutType: validated.earlyCheckoutType,
            ...validated.metadata,
          }
        : undefined,
    };

    // Additional validation rules
    if (processingOptions.isOvertime && !processingOptions.overtimeRequestId) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Overtime request ID is required for overtime check-in/out',
      });
    }

    // Validate checkTime is not in the future
    if (processingOptions.checkTime > new Date()) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Check time cannot be in the future',
      });
    }

    // Location validation if provided
    if (processingOptions.location) {
      if (
        processingOptions.location.lat < -90 ||
        processingOptions.location.lat > 90 ||
        processingOptions.location.lng < -180 ||
        processingOptions.location.lng > 180
      ) {
        throw new AppError({
          code: ErrorCode.INVALID_INPUT,
          message: 'Invalid location coordinates',
        });
      }
    }

    return processingOptions;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid request data',
        details: transformZodErrors(error),
      });
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError({
      code: ErrorCode.INVALID_INPUT,
      message: 'Request validation failed',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      originalError: error,
    });
  }
}

// Additional helper for type checking
export function isValidProcessingOptions(
  data: unknown,
): data is ProcessingOptions {
  try {
    validateCheckInOutRequest(data);
    return true;
  } catch {
    return false;
  }
}

// ============= Type Definitions =============

export type TimeEntryStatus = z.infer<typeof TimeEntryStatusSchema>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export type Location = z.infer<typeof locationSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type CheckInOutAllowance = z.infer<typeof CheckInOutAllowanceSchema>;
export type AttendanceResponse = z.infer<typeof AttendanceResponseSchema>;
export type CurrentPeriodInfo = z.infer<typeof CurrentPeriodInfoSchema>;
export type TimeEntry = z.infer<typeof TimeEntrySchema>;
export type AttendanceStatusInfo = z.infer<typeof AttendanceStatusInfoSchema>;
export type AttendanceCompositeStatus = z.infer<
  typeof AttendanceCompositeStatusSchema
>;
export type ShiftData = z.infer<typeof ShiftDataSchema>;
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;
export type OvertimeEntry = z.infer<typeof OvertimeEntrySchema>;
export type HolidayInfo = z.infer<typeof HolidayInfoSchema>;
export type CheckoutStatusType = z.infer<typeof CheckoutStatusSchema>;
export type CheckInOutAllowanceSchemaType = z.infer<
  typeof CheckInOutAllowanceSchema
>;

// ============= Response Schema =============
export const ResponseDataSchema = z.object({
  user: UserDataSchema,
  attendanceStatus: AttendanceStatusInfoSchema.nullable(),
  effectiveShift: ShiftDataSchema.nullable(),
  checkInOutAllowance: CheckInOutAllowanceSchema.nullable(), // Make nullable
  approvedOvertime: ApprovedOvertimeSchema.nullable(), // Make nullable
  leaveRequests: z.array(LeaveRequestSchema).default([]), // Provide default
});

export type ResponseData = z.infer<typeof ResponseDataSchema>;

// ============= Default Export =============
export default {
  schemas: {
    CheckInOutRequestSchema,
    AttendanceResponseSchema,
    AttendanceCompositeStatusSchema,
    CheckInOutAllowanceSchema,
    UserDataSchema,
    ShiftDataSchema,
    TimeWindowSchema,
    ShiftWindowsSchema,
    CurrentPeriodInfoSchema,
    TimeEntrySchema,
    OvertimeEntrySchema,
    ApprovedOvertimeSchema,
    HolidayInfoSchema,
    LeaveRequestSchema,
    AttendanceStatusInfoSchema,
  },
  validators: {
    validateCheckInOutAllowance,
    validateAttendanceResponse,
    checkInOutRequest: validateCheckInOutRequest,
  },
  helpers: {
    cleanUserData,
    transformDates,
  },
  typeGuards: {
    isValidProcessingOptions,
  },
  constants: {
    EARLY_CHECKOUT_TYPES,
  },
};

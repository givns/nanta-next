import { z } from 'zod';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import { getCurrentTime } from '@/utils/dateUtils';
import { normalizeLocation } from '@/utils/locationUtils';
import { AppError, ErrorCode } from '@/types/attendance/error';
import { ProcessingOptions } from '@/types/attendance/processing';
import { UserRole } from '@/types/enum';

// ===================================
// Constants
// ===================================
export const EARLY_CHECKOUT_TYPES = {
  emergency: 'emergency',
  planned: 'planned',
} as const;

// ===================================
// Base Schemas
// ===================================
const DateStringOrDate = z
  .union([z.string(), z.date()])
  .transform((val) => (typeof val === 'string' ? new Date(val) : val));

// Location schema
const GeoLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  timestamp: DateStringOrDate.optional(),
  provider: z.string().optional(),
});

// Period state schema
const UnifiedPeriodStateSchema = z.object({
  type: z.nativeEnum(PeriodType),
  timeWindow: z.object({
    start: z.string(),
    end: z.string(),
  }),
  activity: z.object({
    isActive: z.boolean(),
    checkIn: z.string().nullable(),
    checkOut: z.string().nullable(),
    isOvertime: z.boolean(),
    overtimeId: z.string().optional(),
    isDayOffOvertime: z.boolean(),
  }),
  validation: z.object({
    isWithinBounds: z.boolean(),
    isEarly: z.boolean(),
    isLate: z.boolean(),
    isOvernight: z.boolean(),
    isConnected: z.boolean(),
  }),
  transition: z
    .object({
      nextPeriod: z.nativeEnum(PeriodType),
      availableAt: z.string(),
      isComplete: z.boolean(),
    })
    .optional(),
});

// State validation schema
const StateValidationSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  flags: z.object({
    hasActivePeriod: z.boolean(),
    isInsideShift: z.boolean(),
    isOutsideShift: z.boolean(),
    isEarlyCheckIn: z.boolean(),
    isLateCheckIn: z.boolean(),
    isEarlyCheckOut: z.boolean(),
    isLateCheckOut: z.boolean(),
    isVeryLateCheckOut: z.boolean(),
    isOvertime: z.boolean(),
    isPendingOvertime: z.boolean(),
    isDayOffOvertime: z.boolean(),
    isAutoCheckIn: z.boolean(),
    isAutoCheckOut: z.boolean(),
    requiresAutoCompletion: z.boolean(),
    hasPendingTransition: z.boolean(),
    requiresTransition: z.boolean(),
    isAfternoonShift: z.boolean(),
    isMorningShift: z.boolean(),
    isAfterMidshift: z.boolean(),
    isApprovedEarlyCheckout: z.boolean(),
    isPlannedHalfDayLeave: z.boolean(),
    isEmergencyLeave: z.boolean(),
    isHoliday: z.boolean(),
    isDayOff: z.boolean(),
    isManualEntry: z.boolean(),
  }),
  metadata: z
    .object({
      nextTransitionTime: z.string().optional(),
      requiredAction: z.string().optional(),
      additionalInfo: z.record(z.unknown()).optional(),
    })
    .optional(),
});

// Period transition schema
const PeriodTransitionSchema = z.object({
  from: z.object({
    periodIndex: z.number(),
    type: z.nativeEnum(PeriodType),
  }),
  to: z.object({
    periodIndex: z.number(),
    type: z.nativeEnum(PeriodType),
  }),
  transitionTime: z.string(),
  isComplete: z.boolean(),
});

// Attendance base response schema
const AttendanceBaseResponseSchema = z.object({
  state: z.nativeEnum(AttendanceState),
  checkStatus: z.nativeEnum(CheckStatus),
  isCheckingIn: z.boolean(),
  latestAttendance: z
    .object({
      id: z.string(),
      employeeId: z.string(),
      date: DateStringOrDate,
      CheckInTime: DateStringOrDate.nullable(),
      CheckOutTime: DateStringOrDate.nullable(),
      state: z.nativeEnum(AttendanceState),
      checkStatus: z.nativeEnum(CheckStatus),
    })
    .nullable(),
  periodInfo: z.object({
    type: z.nativeEnum(PeriodType),
    isOvertime: z.boolean(),
    overtimeState: z.nativeEnum(OvertimeState).optional(),
  }),
  validation: z.object({
    canCheckIn: z.boolean(),
    canCheckOut: z.boolean(),
    message: z.string().optional(),
  }),
  metadata: z.object({
    lastUpdated: z.string(),
    version: z.number(),
    source: z.enum(['system', 'manual', 'auto']),
  }),
});

// Daily attendance status schema
const DailyAttendanceStatusSchema = z.object({
  date: z.string(),
  currentState: UnifiedPeriodStateSchema,
  transitions: z.array(PeriodTransitionSchema),
});

// User data schema
const UserDataSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  lineUserId: z.string().nullable(),
  nickname: z.string().nullable(),
  departmentName: z.string(),
  shiftCode: z.string().nullable(),
  employeeType: z.string(),
  role: z.nativeEnum(UserRole),
  profilePictureUrl: z.string().nullable(),
  shiftId: z.string().nullable(),
  sickLeaveBalance: z.number(),
  businessLeaveBalance: z.number(),
  annualLeaveBalance: z.number(),
  updatedAt: z.date().optional(),
});

// Shift window response schema
const ShiftWindowResponseSchema = z.object({
  current: z.object({
    start: z.string(),
    end: z.string(),
  }),
  type: z.nativeEnum(PeriodType),
  shift: z.object({
    id: z.string(),
    shiftCode: z.string(),
    name: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    workDays: z.array(z.number()),
  }),
  isHoliday: z.boolean(),
  isDayOff: z.boolean(),
  isAdjusted: z.boolean(),
  holidayInfo: z
    .object({
      name: z.string(),
      date: z.string(),
    })
    .optional(),
  overtimeInfo: z
    .object({
      id: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      durationMinutes: z.number(),
      isInsideShiftHours: z.boolean(),
      isDayOffOvertime: z.boolean(),
      isDayOff: z.boolean(),
      reason: z.string().optional(),
      validationWindow: z
        .object({
          earliestCheckIn: DateStringOrDate,
          latestCheckOut: DateStringOrDate,
        })
        .optional(),
    })
    .optional(),
  nextPeriod: z
    .object({
      type: z.nativeEnum(PeriodType),
      startTime: z.string().nullable(),
    })
    .nullable()
    .optional(),
  transition: z
    .object({
      from: z.object({
        type: z.nativeEnum(PeriodType),
        end: z.string(),
      }),
      to: z.object({
        type: z.nativeEnum(PeriodType),
        start: z.string().nullable(),
      }),
      isInTransition: z.boolean(),
    })
    .optional(),
});

// Main attendance status response schema
export const AttendanceStatusResponseSchema = z.object({
  daily: DailyAttendanceStatusSchema,
  base: AttendanceBaseResponseSchema,
  window: ShiftWindowResponseSchema,
  validation: StateValidationSchema,
});

// Check-in/out request schema
export const CheckInOutRequestSchema = z
  .object({
    employeeId: z.string().optional(),
    lineUserId: z.string().optional(),
    isCheckIn: z.boolean(),
    checkTime: z.string(),
    periodType: z.nativeEnum(PeriodType),
    activity: z.object({
      isCheckIn: z.boolean(),
      isOvertime: z.boolean().optional(),
      isManualEntry: z.boolean().optional(),
      requireConfirmation: z.boolean().optional(),
      overtimeMissed: z.boolean().optional(),
    }),
    location: z
      .object({
        coordinates: GeoLocationSchema.optional(),
        address: z.string().optional(),
        inPremises: z.boolean().optional(),
      })
      .optional(),
    transition: z
      .object({
        from: z
          .object({
            type: z.nativeEnum(PeriodType),
            endTime: z.string(),
          })
          .optional(),
        to: z
          .object({
            type: z.nativeEnum(PeriodType),
            startTime: z.string(),
          })
          .optional(),
      })
      .optional(),
    metadata: z
      .object({
        overtimeId: z.string().optional(),
        reason: z.string().optional(),
        photo: z.string().optional(),
        source: z.enum(['manual', 'system', 'auto']).optional(),
        updatedBy: z.string().optional(),
      })
      .optional(),
  })
  .refine((data) => Boolean(data.employeeId || data.lineUserId), {
    message: 'Either employeeId or lineUserId must be provided',
    path: ['identification'],
  });

// ===================================
// Helper Functions
// ===================================

function transformZodErrors(zodErrors: z.ZodError): Record<string, unknown> {
  return {
    errors: zodErrors.errors.map((error) => ({
      path: error.path.join('.'),
      code: error.code,
      message: error.message,
      ...(error.code === 'invalid_type' && {
        expected: error.expected,
        received: error.received,
      }),
      ...(error.code === 'invalid_enum_value' && {
        expected: error.options,
        received: error.received,
      }),
      ...(error.code === 'custom' &&
        error.params && {
          params: error.params,
        }),
    })),
    errorCount: zodErrors.errors.length,
    _tag: 'ZodValidationError',
  };
}

export function validateCheckInOutRequest(data: unknown): ProcessingOptions {
  try {
    const validated = CheckInOutRequestSchema.parse(data);
    const transformedLocation = validated.location?.coordinates
      ? normalizeLocation(validated.location.coordinates)
      : undefined;

    let checkTime: string;
    if (validated.checkTime) {
      const parsedTime = new Date(validated.checkTime);
      if (!isNaN(parsedTime.getTime())) {
        checkTime = parsedTime.toISOString();
      } else {
        checkTime = getCurrentTime().toISOString();
      }
    } else {
      checkTime = getCurrentTime().toISOString();
    }

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

    const processingOptions: ProcessingOptions = {
      employeeId: validated.employeeId || '',
      lineUserId: validated.lineUserId,
      checkTime,
      periodType: validated.periodType,
      activity: {
        isCheckIn: validated.activity.isCheckIn,
        isOvertime: validated.activity.isOvertime || false,
        isManualEntry: validated.activity.isManualEntry || false,
        requireConfirmation: validated.activity.requireConfirmation,
        overtimeMissed: validated.activity.overtimeMissed,
      },
      location: transformedLocation
        ? {
            coordinates: transformedLocation,
            address: validated.location?.address,
            inPremises: validated.location?.inPremises,
          }
        : undefined,
      transition: validated.transition,
      metadata: validated.metadata,
    };

    if (new Date(processingOptions.checkTime) > getCurrentTime()) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Check time cannot be in the future',
      });
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

// Type guard function
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

// ===================================
// Type Exports
// ===================================
export type AttendanceStatusResponse = z.infer<
  typeof AttendanceStatusResponseSchema
>;
export type CheckInOutRequest = z.infer<typeof CheckInOutRequestSchema>;
export type UnifiedPeriodState = z.infer<typeof UnifiedPeriodStateSchema>;
export type StateValidation = z.infer<typeof StateValidationSchema>;
export type UserDataSchema = z.infer<typeof UserDataSchema>;

// Default export with all schemas and utilities
export default {
  schemas: {
    AttendanceStatusResponseSchema,
    CheckInOutRequestSchema,
    UnifiedPeriodStateSchema,
    StateValidationSchema,
    UserDataSchema,
  },
  validators: {
    validateCheckInOutRequest,
    isValidProcessingOptions,
  },
  constants: {
    EARLY_CHECKOUT_TYPES,
  },
};

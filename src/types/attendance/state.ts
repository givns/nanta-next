import { PeriodType } from '@prisma/client';
import { AttendanceBaseResponse } from './base';
import { ShiftContext, TransitionContext } from './shift';
import { ValidationMetadata } from './interface';
import { OvertimeContext } from './overtime';
import { ValidationResult } from './validation';
// The types below are imported but not directly used in this file
// We'll export them to indicate they're being re-exported through this module
export type { PeriodStatusInfo, TransitionStatusInfo } from './period';

export interface AttendanceStateResponse {
  daily: DailyAttendanceStatus;
  base: AttendanceBaseResponse;
  context: ShiftContext & TransitionContext;
  validation: StateValidation;
}

// This interface is extending AttendanceStateResponse without adding properties
// Change to a type alias to fix the empty interface error
export type AttendanceStatusResponse = AttendanceStateResponse;

export interface DailyAttendanceStatus {
  date: string;
  currentState: UnifiedPeriodState;
  transitions: PeriodTransition[];
}

export interface PeriodTransition {
  from: {
    periodIndex: number;
    type: PeriodType;
  };
  to: {
    periodIndex: number;
    type: PeriodType;
  };
  transitionTime: string;
  isComplete: boolean;
}

export interface PeriodState {
  // Current period information
  current: UnifiedPeriodState; // Current period state
  transitions: PeriodTransition[]; // Any pending transitions
  overtime: OvertimeContext | undefined; // Overtime context if exists
  validation: ValidationResult; // Validation state
}

export interface UnifiedPeriodState {
  type: PeriodType;
  timeWindow: {
    start: string; // ISO string
    end: string; // ISO string
  };
  activity: {
    isActive: boolean;
    checkIn: string | null; // ISO string
    checkOut: string | null; // ISO string
    isOvertime: boolean;
    overtimeId?: string;
    isDayOffOvertime: boolean;
    isInsideShiftHours?: boolean;
  };
  validation: {
    isWithinBounds?: boolean;
    isEarly?: boolean;
    isLate?: boolean;
    isOvernight: boolean;
    isConnected: boolean;
  };
}

export interface StateValidation {
  errors: any;
  warnings: any;
  allowed: boolean;
  reason: string;
  flags: ValidationFlags;
  metadata?: ValidationMetadata;
}

export interface ValidationFlags {
  // Basic check-in/out status
  isCheckingIn: boolean;
  isLateCheckIn: boolean;
  isEarlyCheckIn: boolean;
  isEarlyCheckOut: boolean;
  isLateCheckOut: boolean;
  isVeryLateCheckOut: boolean;

  // Period status
  hasActivePeriod: boolean;
  isInsideShift: boolean;
  isOutsideShift: boolean;
  isOvertime: boolean;
  isDayOffOvertime: boolean;
  isPendingOvertime: boolean;

  // Automation flags
  isAutoCheckIn: boolean;
  isAutoCheckOut: boolean;
  requireConfirmation: boolean;
  requiresAutoCompletion: boolean;

  // Transition flags
  hasPendingTransition: boolean;
  requiresTransition: boolean;

  // Shift timing
  isMorningShift: boolean;
  isAfternoonShift: boolean;
  isAfterMidshift: boolean;

  // Special cases
  isPlannedHalfDayLeave: boolean;
  isEmergencyLeave: boolean;
  isApprovedEarlyCheckout: boolean;
  isHoliday: boolean;
  isDayOff: boolean;
  isManualEntry: boolean;
}

// New: State Resolution Result
export interface StateResolutionResult {
  currentState: UnifiedPeriodState;
  transitions: PeriodTransition[];
  validation: StateValidation;
}

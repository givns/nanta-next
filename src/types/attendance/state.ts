import { PeriodType } from '@prisma/client';
import { AttendanceBaseResponse } from './base';
import { ShiftContext, TransitionContext } from './shift';

export interface AttendanceStateResponse {
  daily: DailyAttendanceStatus;
  base: AttendanceBaseResponse;
  context: ShiftContext & TransitionContext;
  validation: StateValidation;
}

export interface AttendanceStatusResponse extends AttendanceStateResponse {}

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
    isWithinBounds: boolean;
    isEarly: boolean;
    isLate: boolean;
    isOvernight: boolean;
    isConnected: boolean;
  };
}

export interface StateValidation {
  allowed: boolean;
  reason: string;
  flags: ValidationFlags;
  metadata?: ValidationMetadata;
}

export interface ValidationFlags {
  hasActivePeriod: boolean;
  isInsideShift: boolean;
  isOutsideShift: boolean;
  isEarlyCheckIn: boolean;
  isLateCheckIn: boolean;
  isEarlyCheckOut: boolean;
  isLateCheckOut: boolean;
  isVeryLateCheckOut: boolean;
  isOvertime: boolean;
  isDayOffOvertime: boolean;
  isPendingOvertime: boolean;
  isAutoCheckIn: boolean;
  isAutoCheckOut: boolean;
  requiresAutoCompletion: boolean;
  hasPendingTransition: boolean;
  requiresTransition: boolean;
  isMorningShift: boolean;
  isAfternoonShift: boolean;
  isAfterMidshift: boolean;
  isApprovedEarlyCheckout: boolean;
  isPlannedHalfDayLeave: boolean;
  isEmergencyLeave: boolean;
  isHoliday: boolean;
  isDayOff: boolean;
  isManualEntry: boolean;
}

export interface ValidationMetadata {
  nextTransitionTime?: string;
  requiredAction?: string;
  additionalInfo?: Record<string, unknown>;
}

// New: State Resolution Result
export interface StateResolutionResult {
  currentState: UnifiedPeriodState;
  transitions: PeriodTransition[];
  validation: StateValidation;
}

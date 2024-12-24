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
  flags: {
    // Core Status Flags
    hasActivePeriod: boolean;
    isInsideShift: boolean;
    isOutsideShift: boolean;

    // Check-in Related
    isEarlyCheckIn: boolean;
    isLateCheckIn: boolean;

    // Check-out Related
    isEarlyCheckOut: boolean;
    isLateCheckOut: boolean;
    isVeryLateCheckOut: boolean;

    // Overtime Related
    isOvertime: boolean;
    isPendingOvertime: boolean;
    isDayOffOvertime: boolean;

    // Auto-completion
    isAutoCheckIn: boolean;
    isAutoCheckOut: boolean;
    requiresAutoCompletion: boolean;

    // Transition
    hasPendingTransition: boolean;
    requiresTransition: boolean;

    // Schedule Related
    isAfternoonShift: boolean;
    isMorningShift: boolean;
    isAfterMidshift: boolean;

    // Special Cases
    isApprovedEarlyCheckout: boolean;
    isPlannedHalfDayLeave: boolean;
    isEmergencyLeave: boolean;
    isHoliday: boolean;
    isDayOff: boolean;
    isManualEntry: boolean;
  };
  metadata?: {
    nextTransitionTime?: string; // ISO string
    requiredAction?: string;
    additionalInfo?: Record<string, unknown>;
  };
}

// New: State Resolution Result
export interface StateResolutionResult {
  currentState: UnifiedPeriodState;
  transitions: PeriodTransition[];
  validation: StateValidation;
}

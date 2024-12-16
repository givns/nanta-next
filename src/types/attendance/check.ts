// ===================================
// types/attendance/check.ts
// Check-in/out related types
// ===================================
import { OvertimeMetadata } from './records';
import { PeriodType } from './status';
import { Location } from './base';
import { AttendanceState } from '@prisma/client';

// Keep and enhance

export type CheckoutStatusType = 'very_early' | 'early' | 'normal' | 'late';
export type EarlyCheckoutType = 'emergency' | 'planned';

interface TransitionWindowTiming {
  start: string;
  end: string;
  fromPeriod: PeriodType;
  toPeriod: PeriodType;
}

// Enhanced check types
export interface CheckInOutAllowance {
  allowed: boolean;
  reason: string;
  inPremises: boolean;
  address: string;
  periodType: PeriodType;
  isLastPeriod: boolean;
  requireConfirmation?: boolean;

  // Enhanced flags
  flags: {
    isOvertime?: boolean;
    isDayOffOvertime?: boolean;
    isPendingDayOffOvertime?: boolean;
    isPendingOvertime?: boolean;
    isOutsideShift?: boolean;
    isInsideShift?: boolean;
    isLate?: boolean;
    isEarlyCheckIn?: boolean;
    isEarlyCheckOut?: boolean;
    isLateCheckIn?: boolean;
    isLateCheckOut?: boolean;
    isVeryLateCheckOut?: boolean;
    isAutoCheckIn?: boolean;
    isAutoCheckOut?: boolean;
    isAfternoonShift?: boolean;
    isMorningShift?: boolean;
    isAfterMidshift?: boolean;
    isApprovedEarlyCheckout?: boolean;
    isPlannedHalfDayLeave?: boolean;
    isEmergencyLeave?: boolean;
  };

  // Enhanced timing
  timing: {
    countdown?: number;
    lateCheckOutMinutes?: number;
    minutesEarly?: number;
    earliestAllowedTime?: string;
    missedCheckInTime?: number;
    missedCheckOutTime?: number;
    overtimeMissed?: boolean;
    checkoutStatus?: CheckoutStatusType;
    earlyCheckoutType?: EarlyCheckoutType;
    actualStartTime?: string;
    actualEndTime?: string;
    plannedStartTime?: string;
    plannedEndTime?: string;
    maxCheckOutTime?: string;
    transitionWindow?: TransitionWindowTiming;
    transitionTime?: string;
    missedEntries?: Array<{
      type: 'check-in' | 'check-out';
      periodType: PeriodType;
      expectedTime: string;
      overtimeId?: string;
    }>;
  };

  // Enhanced metadata
  metadata: {
    overtimeId?: string;
    nextPeriod?: {
      type: PeriodType;
      startTime: string;
      overtimeId?: string;
    };
  };
}

export interface CheckValidationResult {
  isValid: boolean;
  status: AttendanceState;
  message?: string;
  overtimeContext?: {
    isOvertime: boolean;
    bounds?: {
      plannedStartTime: Date;
      plannedEndTime: Date;
    };
    metadata?: OvertimeMetadata;
  };
}

export interface LateCheckOutStatus {
  isLateCheckOut: boolean;
  isVeryLateCheckOut: boolean;
  minutesLate: number;
}

export interface CheckInData {
  employeeId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  isLate?: boolean;
}

export interface CheckOutData {
  attendanceId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
}

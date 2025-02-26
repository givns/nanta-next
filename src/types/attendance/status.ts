// types/attendance/status.ts

import { LeaveRequest } from './leave';
import { ShiftData } from './shift';
import { OvertimeContext } from './overtime';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
  TimeEntryStatus,
} from '@prisma/client';

export enum ApprovalState {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export type LeaveFormat = 'ลาเต็มวัน' | 'ลาครึ่งวัน';
export type LeaveType = 'ลาป่วย' | 'ลากิจ' | 'ลาพักร้อน' | 'ลาไม่รับค่าจ้าง';

/**
 * @deprecated Use appropriate state enums instead
 */
export type AttendanceStatusValue = keyof typeof AttendanceState;

/**
 * @deprecated Use specific state enums instead
 */
export enum AttendanceStatusType {
  'checked-in',
  'checked-out',
  'overtime-started',
  'overtime-ended',
  'pending',
  'approved',
  'day-off',
  'overtime',
  'incomplete',
}

/**
 * Composite Types
 */

export interface AttendanceCompositeStatus {
  state: AttendanceState;
  checkStatus: CheckStatus;
  isOvertime: boolean;
  overtimeState?: OvertimeState;
  approvalState?: ApprovalState;
  overtimeDuration?: number;
}

export enum PeriodStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  COMPLETED = 'completed',
}

export type OvertimeStatus = 'in_progress' | 'completed';

export type OvertimeRequestStatus =
  | 'pending_response'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'declined_by_employee';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/**
 * Type Guards
 */
export const isAttendanceState = (state: string): state is AttendanceState => {
  return Object.values(AttendanceState).includes(state as AttendanceState);
};

export const isCheckStatus = (status: string): status is CheckStatus => {
  return Object.values(CheckStatus).includes(status as CheckStatus);
};

export const isTimeEntryStatus = (
  status: string,
): status is TimeEntryStatus => {
  return Object.values(TimeEntryStatus).includes(status as TimeEntryStatus);
};

export const isOvertimeStatus = (status: string): status is OvertimeStatus => {
  return ['in_progress', 'completed'].includes(status);
};

export const isOvertimeRequestStatus = (
  status: string,
): status is OvertimeRequestStatus => {
  return [
    'pending_response',
    'pending',
    'approved',
    'rejected',
    'declined_by_employee',
  ].includes(status);
};

/**
 * Core Status Interfaces
 */

export interface LastEntryInfo {
  time: Date;
  periodType: PeriodType;
  isOvertime: boolean;
}

export interface MissingEntry {
  type: 'check-in' | 'check-out';
  periodType: PeriodType;
  expectedTime: Date;
  overtimeId?: string;
}

export interface PendingTransition {
  from: PeriodType;
  to: PeriodType;
  transitionTime: Date;
  isComplete: boolean;
}

export interface ValidationEnhancement {
  autoCompletionRequired: boolean;
  pendingTransitionValidation: {
    canTransition: boolean;
    reason?: string;
    nextPeriodStart?: Date;
  };
  periodValidation: {
    isWithinPeriod: boolean;
    isEarlyForPeriod: boolean;
    isLateForPeriod: boolean;
    periodStart: Date;
    periodEnd: Date;
  };
}

export interface CurrentPeriod {
  type: PeriodType;
  overtimeInfo?: OvertimeContext;
  isComplete: boolean;
}

export interface NextPeriod {
  type: PeriodType;
  startTime: string;
  overtimeInfo?: OvertimeContext;
}

export interface StatusContext {
  shift: ShiftData;
  leave: LeaveRequest | null;
  overtime: ApprovedOvertimeInfo | null;
}

export interface AttendanceStateChange {
  state: {
    previous: AttendanceState;
    current: AttendanceState;
  };
  checkStatus: {
    previous: CheckStatus;
    current: CheckStatus;
  };
  overtime?: {
    previous?: {
      isOvertime: boolean;
      state?: OvertimeState;
    };
    current?: {
      isOvertime: boolean;
      state?: OvertimeState;
    };
  };
}

export interface StatusUpdateResult {
  stateChange: AttendanceStateChange;
  timestamp: Date;
  reason: string;
  metadata?: {
    updatedBy?: string;
    source?: 'system' | 'manual' | 'auto';
    location?: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    };
    comments?: string;
    [key: string]: unknown;
  };
}

export interface OvertimeAttendanceInfo {
  overtimeRequest: ApprovedOvertimeInfo;
  attendanceTime: {
    checkInTime: string | null;
    checkOutTime: string | null;
    checkStatus: CheckStatus;
    isOvertime: boolean;
    overtimeState: OvertimeState;
  };
  periodStatus: {
    isPending: boolean;
    isActive: boolean;
    isNext: boolean;
    isComplete: boolean;
  };
}

export interface ApprovedOvertimeInfo {
  id: string;
  employeeId: string;
  date: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: OvertimeRequestStatus;
  employeeResponse: string | null;
  reason: string | null;
  approverId: string | null;
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
}

// Update StatusHelpers to use isOvertime flag
export const StatusHelpers = {
  isActive: (status: AttendanceCompositeStatus): boolean => {
    return status.checkStatus === CheckStatus.CHECKED_IN;
  },

  isComplete: (status: AttendanceCompositeStatus): boolean => {
    return status.checkStatus === CheckStatus.CHECKED_OUT;
  },

  isInOvertime: (status: AttendanceCompositeStatus): boolean => {
    return (
      status.isOvertime && status.overtimeState === OvertimeState.IN_PROGRESS
    );
  },

  isOvertimeComplete: (status: AttendanceCompositeStatus): boolean => {
    return (
      status.isOvertime && status.overtimeState === OvertimeState.COMPLETED
    );
  },

  getDisplayStatus: (status: AttendanceCompositeStatus): string => {
    if (status.state === AttendanceState.HOLIDAY) return 'Holiday';
    if (status.state === AttendanceState.OFF) return 'Day Off';

    if (status.isOvertime) {
      switch (status.overtimeState) {
        case OvertimeState.IN_PROGRESS:
          return 'Overtime Active';
        case OvertimeState.COMPLETED:
          return 'Overtime Complete';
        default:
          return 'Overtime Not Started';
      }
    }

    switch (status.checkStatus) {
      case CheckStatus.CHECKED_IN:
        return 'Checked In';
      case CheckStatus.CHECKED_OUT:
        return 'Checked Out';
      default:
        return 'Pending';
    }
  },

  // Helper for overtime transitions
  canStartOvertime: (status: AttendanceCompositeStatus): boolean => {
    return (
      status.checkStatus === CheckStatus.CHECKED_OUT &&
      !status.isOvertime &&
      status.state === AttendanceState.PRESENT
    );
  },
};

// Add overtime-specific type guards
export const OvertimeHelpers = {
  canTransitionToOvertime: (status: AttendanceCompositeStatus): boolean => {
    return (
      !status.isOvertime &&
      status.checkStatus === CheckStatus.CHECKED_OUT &&
      status.state === AttendanceState.PRESENT
    );
  },

  isValidOvertimeTransition: (
    current: AttendanceCompositeStatus,
    next: Partial<AttendanceCompositeStatus>,
  ): boolean => {
    // Can't transition to overtime if already in overtime
    if (current.isOvertime && next.isOvertime) {
      return false;
    }

    // Can only start overtime after regular check-out
    if (!current.isOvertime && next.isOvertime) {
      return current.checkStatus === CheckStatus.CHECKED_OUT;
    }

    return true;
  },

  calculateOvertimeDuration: (
    startTime: Date,
    endTime: Date | null,
    isComplete: boolean,
  ): number => {
    if (!endTime || !isComplete) return 0;
    return (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60); // Hours
  },
};
/**
 * Legacy Support Helpers
 */
export const StatusMappers = {
  toLegacyStatus: (
    composite: AttendanceCompositeStatus,
  ): AttendanceStatusValue => {
    return composite.state.toLowerCase() as AttendanceStatusValue;
  },

  toLegacyStatusType: (
    composite: AttendanceCompositeStatus,
  ): AttendanceStatusType => {
    if (composite.overtimeState) {
      return composite.overtimeState === OvertimeState.COMPLETED
        ? AttendanceStatusType['overtime-ended']
        : AttendanceStatusType['overtime-started'];
    }

    switch (composite.checkStatus) {
      case CheckStatus.CHECKED_IN:
        return AttendanceStatusType['checked-in'];
      case CheckStatus.CHECKED_OUT:
        return AttendanceStatusType['checked-out'];
      default:
        return AttendanceStatusType.pending;
    }
  },

  fromLegacyStatus: (
    status: AttendanceStatusValue,
  ): Partial<AttendanceCompositeStatus> => {
    return {
      state: status.toUpperCase() as unknown as AttendanceState,
      checkStatus:
        status === 'PRESENT' ? CheckStatus.CHECKED_OUT : CheckStatus.PENDING,
    };
  },

  // Helper to convert from legacy format
  fromLegacyUpdate: (legacyUpdate: {
    previous: AttendanceStatusValue;
    current: AttendanceStatusValue;
    timestamp: Date;
    reason: string;
    metadata?: Record<string, unknown>;
  }): StatusUpdateResult => {
    const previousState = StatusMappers.fromLegacyStatus(legacyUpdate.previous);
    const currentState = StatusMappers.fromLegacyStatus(legacyUpdate.current);

    return {
      stateChange: {
        state: {
          previous: previousState.state!,
          current: currentState.state!,
        },
        checkStatus: {
          previous: previousState.checkStatus!,
          current: currentState.checkStatus!,
        },
      },
      timestamp: legacyUpdate.timestamp,
      reason: legacyUpdate.reason,
      metadata: legacyUpdate.metadata,
    };
  },

  // Helper to get a human-readable description of the change
  getChangeDescription: (update: StatusUpdateResult): string => {
    const { stateChange } = update;

    if (stateChange.overtime?.current?.isOvertime) {
      return `Changed from ${stateChange.state.previous} to overtime ${stateChange.overtime.current.state}`;
    }

    if (stateChange.state.previous === stateChange.state.current) {
      return `Updated check status from ${stateChange.checkStatus.previous} to ${stateChange.checkStatus.current}`;
    }

    return `Changed from ${stateChange.state.previous} to ${stateChange.state.current}`;
  },

  // Helper to determine if the update is significant
  isSignificantChange: (update: StatusUpdateResult): boolean => {
    const { stateChange } = update;
    return (
      stateChange.state.previous !== stateChange.state.current ||
      stateChange.checkStatus.previous !== stateChange.checkStatus.current ||
      stateChange.overtime?.previous?.isOvertime !==
        stateChange.overtime?.current?.isOvertime
    );
  },
};

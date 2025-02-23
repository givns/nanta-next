// Types/interfaces.ts

import { TimeWindowValidationResult } from '@/utils/timeWindow/TimeWindowManager';
import { PeriodType } from '@prisma/client';
import {
  EnhancedTimeWindow,
  TimeWindow,
  SerializedAttendanceRecord,
} from './base';
import { ValidationContext } from './context';
import { OvertimeContext } from './overtime';
import {
  TimingFlags,
  PeriodStatusInfo,
  TransitionStatusInfo,
  PeriodDefinition,
} from './period';
import { AttendanceRecord } from './records';
import { ShiftWindowResponse } from './response';
import { ShiftData } from './shift';
import {
  UnifiedPeriodState,
  StateValidation,
  ValidationFlags,
  PeriodState,
  PeriodTransition,
  AttendanceStatusResponse,
} from './state';

// Validation action constants
export const VALIDATION_ACTIONS = {
  ACTIVE_SESSION: 'ACTIVE_SESSION',
  TRANSITION_REQUIRED: 'TRANSITION_REQUIRED',
  WAIT_FOR_OVERTIME: 'WAIT_FOR_OVERTIME',
  OVERTIME_CHECKIN: 'OVERTIME_CHECKIN',
  AUTO_COMPLETE_OVERTIME: 'AUTO_COMPLETE_OVERTIME',
  REGULAR_CHECKIN: 'REGULAR_CHECKIN',
  REGULAR_CHECKOUT: 'REGULAR_CHECKOUT',
  AUTO_COMPLETE: 'AUTO_COMPLETE',
  WAIT_FOR_PERIOD: 'WAIT_FOR_PERIOD',
} as const;

export const VALIDATION_THRESHOLDS = {
  EARLY_CHECKIN: 29,
  OT_EARLY_CHECKIN: 10,
  EARLY_CHECKOUT: 5, // Add this for regular periods
  LATE_CHECKIN: 5,
  LATE_CHECKOUT: 15, // 15 minutes after shift end
  VERY_LATE_CHECKOUT: 60, // 1 hour after shift end
  OVERTIME_CHECKOUT: 15,
  TRANSITION_WINDOW: 15,
} as const;

// Create type for validation actions
export type ValidationAction =
  (typeof VALIDATION_ACTIONS)[keyof typeof VALIDATION_ACTIONS];

// Update ValidationMetadata to use ValidationAction
export interface ValidationMetadata {
  nextTransitionTime?: string;
  requiredAction?: ValidationAction; // Now using the union type
  additionalInfo?: Record<string, unknown>;
  missingEntries?: any[];
  transitionWindow?: {
    start: string;
    end: string;
    targetPeriod: PeriodType;
  };
}

export interface ITimeManager {
  calculateTimeWindows(
    periodType: PeriodType,
    shiftData: ShiftData,
    context: ValidationContext,
  ): EnhancedTimeWindow[];
  calculateTimingFlags(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): TimingFlags;
  validateTimeWindow(
    now: Date,
    window: TimeWindow,
    options?: any,
  ): TimeWindowValidationResult;
  isWithinShiftWindow(
    now: Date,
    shiftData: ShiftData,
    options?: { includeEarlyWindow?: boolean; includeLateWindow?: boolean },
  ): boolean;
}

export interface IPeriodStateResolver {
  calculatePeriodState(
    employeeId: string,
    records: AttendanceRecord[] | null,
    now: Date,
    shiftData: ShiftData,
    context: ValidationContext,
  ): Promise<UnifiedPeriodState>;
  createStateValidation(
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
    shiftData: ShiftData,
    context: ValidationContext,
    statusInfo: PeriodStatusInfo,
    transitionInfo: TransitionStatusInfo,
  ): StateValidation;
  buildValidationFlags(
    statusInfo: PeriodStatusInfo,
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
    shiftData: ShiftData,
    context: ValidationContext,
  ): ValidationFlags;
  getValidationMessage(
    statusInfo: PeriodStatusInfo,
    currentState: UnifiedPeriodState,
    attendance: AttendanceRecord | null,
    now: Date,
    flags: ValidationFlags,
  ): string;
}

export interface IPeriodManagementService {
  getCurrentPeriodState(
    employeeId: string,
    records: AttendanceRecord[] | null,
    now: Date,
  ): Promise<PeriodState>;
  determineTransitionStatusInfo(
    statusInfo: PeriodStatusInfo,
    shiftData: ShiftData,
    transitions: PeriodTransition[],
    now: Date,
  ): TransitionStatusInfo;
  buildPeriodSequence(
    overtimeInfo: OvertimeContext | undefined | null,
    shift: ShiftData,
    attendance: AttendanceRecord | null,
    now: Date,
  ): Promise<PeriodDefinition[]>;
  calculatePeriodTransitions(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    activeRecord: AttendanceRecord | null,
    now: Date,
  ): PeriodTransition[];
}

export interface IAttendanceEnhancementService {
  enhanceAttendanceStatus(
    serializedAttendance: SerializedAttendanceRecord | null,
    window: ShiftWindowResponse,
    context: ValidationContext,
  ): Promise<AttendanceStatusResponse>;
}

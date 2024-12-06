// types/attendance/validation.ts

import { ErrorCode } from '../errors';
import { AttendanceState, PeriodType } from './status';
import { Location } from './base';
import { ValidationContext } from './context';

// Core validation interfaces
export interface ValidationRule {
  name: string;
  check: (context: ValidationContext) => Promise<boolean>;
  errorCode: ErrorCode;
  errorMessage: string;
  severity: ValidationSeverity;
  metadata?: Record<string, unknown>;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationResult {
  isValid: boolean;
  state: AttendanceState;
  errors: ValidationError[];
  warnings: ValidationWarning[];

  // Context results
  checkInAllowed?: boolean;
  checkOutAllowed?: boolean;
  overtimeAllowed?: boolean;

  // Time windows
  allowedTimeWindows?: {
    start: Date;
    end: Date;
    type: PeriodType;
  }[];

  // Metadata
  metadata?: {
    lastValidated: Date;
    validatedBy?: string;
    rules: string[];
    [key: string]: unknown;
  };
}

export interface AttendanceValidationResult {
  allowed: boolean;
  reason?: string;
  flags: {
    isLateCheckIn: boolean;
    isEarlyCheckOut: boolean;
    isLateCheckOut: boolean;
    isPlannedHalfDayLeave: boolean;
    isEmergencyLeave: boolean;
    isOvertime: boolean;
    isDayOffOvertime: boolean;
    isInsideShift: boolean;
    requireConfirmation: boolean;
    isOutsideAllowedWindow: boolean;
  };
  timing: {
    nextWindowStart?: Date;
    graceWindowEnd?: Date;
    minutesLate?: number;
    minutesEarly?: number;
  };
}

export interface ValidationError {
  code: string;
  message: string;
  severity: ValidationSeverity;
  field?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  context?: Partial<ValidationContext>;
}

export interface ValidationWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Specific validation rule types
export interface TimeValidationRule extends ValidationRule {
  timeWindows: {
    early: number;
    late: number;
    veryLate: number;
  };
}

export interface LocationValidationRule extends ValidationRule {
  radius: number;
  allowedLocations: Location[];
}

export interface OvertimeValidationRule extends ValidationRule {
  maxHours: number;
  minHours: number;
  allowedDays: number[];
}

// Validation collection type
export interface AttendanceValidation {
  rules: ValidationRule[];
  context: ValidationContext;
  result?: ValidationResult;

  // Rule categories
  timeRules: TimeValidationRule[];
  locationRules: LocationValidationRule[];
  overtimeRules: OvertimeValidationRule[];

  // Validation state
  lastValidated?: Date;
  isValidating: boolean;
  validationErrors: ValidationError[];
  validationWarnings: ValidationWarning[];

  // Metadata
  metadata?: {
    version: number;
    updatedAt: Date;
    validatedBy?: string;
    [key: string]: unknown;
  };
}

// Helper type for validation functions
export type ValidationFunction = (
  context: ValidationContext,
) => Promise<ValidationResult>;

// Rule set type
export interface ValidationRuleSet {
  name: string;
  description?: string;
  rules: ValidationRule[];
  priority: number;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

// Validation options
export interface ValidationOptions {
  employeeId: string;
  timestamp: Date;
  isCheckIn: boolean;
  overtimeContext?: {
    isOvertime: boolean;
    bounds?: {
      plannedStartTime: Date;
      plannedEndTime: Date;
    };
    metadata?: {
      isDayOffOvertime: boolean;
      isInsideShiftHours: boolean;
    };
  };
}

// Cache-related validation types
export interface ValidationCache {
  key: string;
  result: ValidationResult;
  timestamp: Date;
  ttl: number;
}

// Validation repository interface
export interface ValidationRepository {
  getRules(): Promise<ValidationRule[]>;
  getRuleSet(name: string): Promise<ValidationRuleSet>;
  updateRules(rules: ValidationRule[]): Promise<void>;
  invalidateCache(employeeId: string): Promise<void>;
}

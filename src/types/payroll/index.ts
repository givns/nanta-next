// types/payroll/index.ts

import { EmployeeType } from '@prisma/client';

export type PayrollStatus =
  | 'draft'
  | 'processing'
  | 'completed'
  | 'approved'
  | 'paid';

// API Response Types
export type ApiErrorResponse = {
  success: false;
  error: string;
  meta?: Record<string, unknown>;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type PayrollApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
export interface EmployeeListResponse {
  employeeId: string;
  name: string;
}

export interface PayrollCalculateParams {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
}
// Matches the JSON structure in schema
export interface OvertimeHoursByType {
  workdayOutside: number;
  weekendInside: number;
  weekendOutside: number;
  holidayRegular: number;
  holidayOvertime: number;
}

export interface OvertimeRatesByType {
  workdayOutside: number;
  weekendInside: number;
  weekendOutside: number;
  holidayRegular: number;
  holidayOvertime: number;
}

export interface OvertimePayByType {
  workdayOutside: number;
  weekendInside: number;
  weekendOutside: number;
  holidayRegular: number;
  holidayOvertime: number;
}

export interface PayrollCalculationResult {
  employee: {
    id: string;
    employeeId: string;
    name: string;
    departmentName: string;
    role: string;
    employeeType: EmployeeType;
  };

  // Hours (matching schema)
  regularHours: number;
  overtimeHoursByType: OvertimeHoursByType;
  totalOvertimeHours: number;

  // Attendance
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  totalLateMinutes: number;
  earlyDepartures: number;

  // Leaves
  sickLeaveDays: number;
  businessLeaveDays: number;
  annualLeaveDays: number;
  unpaidLeaveDays: number;
  holidays: number;

  // Rates
  regularHourlyRate: number;
  overtimeRatesByType: OvertimeRatesByType;

  // Calculations
  basePay: number;
  overtimePayByType: OvertimePayByType;
  totalOvertimePay: number;

  // Allowances
  transportationAllowance: number;
  mealAllowance: number;
  housingAllowance: number;
  totalAllowances: number;

  // Deductions
  socialSecurity: number;
  tax: number;
  unpaidLeaveDeduction: number;
  totalDeductions: number;

  // Commission
  salesAmount?: number;
  commissionRate?: number;
  commissionAmount?: number;
  quarterlyBonus?: number | null | undefined;
  yearlyBonus?: number | null | undefined;

  netPayable: number;
  status: PayrollStatus;
  processingNote?: string;

  // Approval
  approvedBy?: string;
  approvedAt?: Date;
  lastModifiedBy?: string;
}

// Settings types matching the JSON in PayrollSettings model
export interface PayrollSettingsData {
  overtimeRates: {
    [key in EmployeeType]: {
      workdayOutsideShift: number;
      weekendInsideShiftFulltime: number;
      weekendInsideShiftParttime: number;
      weekendOutsideShift: number;
    };
  };
  allowances: {
    transportation: number;
    meal: {
      [key in EmployeeType]: number;
    };
    housing: number;
  };
  deductions: {
    socialSecurityRate: number;
    socialSecurityMinBase: number;
    socialSecurityMaxBase: number;
  };
  rules: {
    payrollPeriodStart: number;
    payrollPeriodEnd: number;
    overtimeMinimumMinutes: number;
    roundOvertimeTo: number;
  };
}

// Processing types matching the schema
export interface PayrollProcessingResult {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  processedData: string; // JSON string of PayrollCalculationResult
  status: 'completed' | 'error';
  error?: string;
  errorDetails?: {
    message: string;
    stackTrace?: string;
    context?: Record<string, unknown>;
  };
}

// types/payroll/index.ts

import { Prisma, EmployeeType } from '@prisma/client';

// Base Types
export type EmployeeBaseType = 'FULLTIME' | 'PARTTIME';
export type EmployeeStatus = 'PROBATION' | 'REGULAR';
export type PayrollStatus =
  | 'draft'
  | 'processing'
  | 'completed'
  | 'approved'
  | 'paid';

// Calculation Types
export interface PayrollRates {
  socialSecurityRate: number;
  socialSecurityMinBase: number;
  socialSecurityMaxBase: number;
  workdayOvertimeRate: number;
  weekendShiftOvertimeRate: {
    fulltime: number;
    parttime: number;
  };
  holidayOvertimeRate: number;
  mealAllowancePerDay: number;
  hourlyRate?: number; // Optional, calculated based on salary type
}

export interface WorkingHours {
  regularHours: number;
  workdayOvertimeHours: number;
  weekendShiftOvertimeHours: number;
  holidayOvertimeHours: number;
}

export interface Attendance {
  presentDays: number;
  unpaidLeaveDays: number;
  paidLeaveDays: number;
  holidayDays: number;
}

export interface PayrollPeriodDisplay {
  startDate: Date;
  endDate: Date;
  status: PayrollStatus;
  isCurrentPeriod: boolean;
}

export interface PayrollSettings {
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

// Export interfaces for API responses
export interface PayrollSummaryResponse extends PayrollCalculationResult {
  periodStart: string;
  periodEnd: string;
}

export interface PayrollPeriodResponse {
  periods: PayrollPeriodDisplay[];
  currentPeriod: {
    startDate: string;
    endDate: string;
  };
}

// New consolidated interfaces
export interface PayrollCalculationResult {
  employee: {
    id: string;
    employeeId: string;
    name: string;
    departmentName: string;
    role: string;
    employeeType: EmployeeType;
  };
  summary: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
  };
  hours: {
    regularHours: number;
    workdayOvertimeHours: number;
    weekendShiftOvertimeHours: number;
    holidayOvertimeHours: number;
  };
  attendance: {
    totalLateMinutes: number;
    earlyDepartures: number;
  };
  leaves: {
    sick: number;
    annual: number;
    business: number;
    holidays: number;
    unpaid: number;
  };
  rates: {
    regularHourlyRate: number;
    overtimeRate: number;
  };
  processedData: {
    basePay: number;
    overtimePay: number;
    allowances: {
      transportation: number;
      meal: number;
      housing: number;
    };
    deductions: {
      socialSecurity: number;
      tax: number;
      unpaidLeave: number;
      total: number;
    };
    netPayable: number;
  };
}

// Update PayrollSettings to match current implementation
export interface PayrollSettings {
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

// Keep existing AdminPayrollData but update it to use new types
export interface AdminPayrollData {
  // ... update to extend PayrollCalculationResult
  employee: PayrollCalculationResult['employee'] & {
    bankInfo?: {
      bankName: string;
      accountNumber: string;
    };
  };
  summary: PayrollCalculationResult['summary'] & {
    periodStart: string;
    periodEnd: string;
  };
  hours: PayrollCalculationResult['hours'];
  attendance: PayrollCalculationResult['attendance'] & {
    lateArrivals: number;
    incompleteAttendance: number;
  };
  leaves: PayrollCalculationResult['leaves'];
  rates: PayrollCalculationResult['rates'] & {
    holidayRate: number;
  };
  processedData: PayrollCalculationResult['processedData'];
  adjustments: Array<{
    id: string;
    type: 'addition' | 'deduction';
    amount: number;
    reason: string;
    date: string;
  }>;
  status: PayrollStatus;
  processingNote?: string;
}

// Utility types remain unchanged
export type PayrollCreateInput = Prisma.PayrollCreateInput;
export type PayrollUpdateInput = Prisma.PayrollUpdateInput;

// Export a migration guide constant
export const TYPE_MIGRATION_GUIDE = {
  version: '2.0.0',
  migrationSteps: [
    'Replace PayrollRates with PayrollCalculationResult["rates"]',
    'Replace WorkingHours with PayrollCalculationResult["hours"]',
    'Update API responses to use PayrollCalculationResult',
    'Update components to use new type structure',
  ],
  completionDeadline: '2024-12-31',
} as const;

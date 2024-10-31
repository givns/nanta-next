// types/payroll/index.ts

import { EmployeeType } from '@prisma/client';

// Base enums and types
export type PayrollStatus = 'draft' | 'processing' | 'completed' | 'approved' | 'paid';
export type CommissionStatus = 'calculated' | 'approved' | 'paid';

// Core Calculation Result Interface
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
  commission?: {
    salesAmount: number;
    commissionRate: number;
    commissionAmount: number;
    quarterlyBonus?: number;
    yearlyBonus?: number;
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

// Commission related types
export interface CommissionTier {
  minAmount: number;
  maxAmount?: number;
  percentage: number;
}

export interface CommissionBonus {
  type: 'quarterly' | 'yearly';
  targetAmount: number;
  requiredMonths: number;
  bonusAmount: number;
}

export interface SalesCommission {
  salesAmount: number;
  commissionRate: number;
  commissionAmount: number;
  quarterlyBonus?: number;
  yearlyBonus?: number;
  status: CommissionStatus;
}

// Settings related types
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

// Processing related types
export interface PayrollProcessingSession {
  periodYearMonth: string;
  status: 'processing' | 'completed' | 'error';
  totalEmployees: number;
  processedCount: number;
  error?: string;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface PayrollProcessingResult {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  processedData: PayrollCalculationResult;
  status: 'completed' | 'error';
}

export interface PayrollAdjustment {
  type: 'bonus' | 'deduction' | 'correction';
  amount: number;
  reason: string;
  periodStart: Date;
  periodEnd: Date;
}

// Period related types
export interface PayrollPeriod {
  startDate: Date;
  endDate: Date;
  status: PayrollStatus;
}

// Response types for API endpoints
export interface PayrollSummaryResponse extends PayrollCalculationResult {
  periodStart: string;
  periodEnd: string;
  bankInfo?: {
    bankName: string;
    accountNumber: string;
  };
}
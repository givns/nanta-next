// types/payroll/index.ts

import { Prisma } from '@prisma/client';

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

export interface PayrollCalculationInput {
  basePayAmount: number;
  employeeBaseType: EmployeeBaseType;
  employeeStatus: EmployeeStatus;
  isGovernmentRegistered: boolean;
  workingHours: WorkingHours;
  attendance: Attendance;
  additionalAllowances: {
    managerAllowance?: number;
    other?: number;
  };
}

export interface PayrollCalculationResult {
  actualBasePayAmount: number;
  overtimeAmount: {
    workday: number;
    weekendShift: number;
    holiday: number;
    total: number;
  };
  allowances: {
    meal: number;
    manager: number;
    other: number;
    total: number;
  };
  deductions: {
    socialSecurity: number;
    other: number;
    total: number;
  };
  grossAmount: number;
  netPayable: number;
}

// API Response Types
export interface PayrollSummaryResponse {
  periodStart: string;
  periodEnd: string;
  employeeName: string;
  departmentName: string;
  totalWorkDays: number;
  holidays: number;
  regularHours: number;
  overtimeHours: number;
  daysPresent: number;
  daysAbsent: number;
  leaves: {
    sick: number;
    business: number;
    annual: number;
    unpaid: number;
  };
  earnings: {
    basePay: number;
    overtimePay: number;
    holidayPay: number;
    allowances: number;
    totalDeductions: number;
    netPayable: number;
    deductions: {
      socialSecurity: number;
      tax: number;
    };
  };
  bankInfo?: {
    bankName: string;
    accountNumber: string;
  };
}

// Administrative Interface Types
export interface AdminPayrollData {
  employee: {
    id: string;
    name: string;
    employeeId: string;
    departmentName: string;
    role: string;
    bankInfo?: {
      bankName: string;
      accountNumber: string;
    };
  };
  summary: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
    periodStart: string;
    periodEnd: string;
  };
  hours: {
    regularHours: number;
    overtimeHours: number;
    holidayHours: number;
    holidayOvertimeHours: number;
  };
  attendance: {
    totalLateMinutes: number;
    earlyDepartures: number;
    lateArrivals: number;
    incompleteAttendance: number;
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
    holidayRate: number;
  };
  earnings: {
    baseAmount: number;
    overtimeAmount: number;
    holidayAmount: number;
  };
  allowances: {
    transportation: number;
    meal: number;
    housing: number;
    other: number;
  };
  deductions: {
    socialSecurity: number;
    tax: number;
    other: number;
  };
  adjustments: Array<{
    id: string;
    type: 'addition' | 'deduction';
    amount: number;
    reason: string;
    date: string;
  }>;
  netPayable: number;
  status: PayrollStatus;
  processingNote?: string;
}

// Database Input Types
export type PayrollCreateInput = Prisma.PayrollCreateInput;
export type PayrollUpdateInput = Prisma.PayrollUpdateInput;

// Utility Types
export interface PayrollPeriodInfo {
  id: string;
  startDate: Date;
  endDate: Date;
  status: PayrollStatus;
}

export interface PayrollSettings {
  id: string;
  employeeType: string;
  regularHourlyRate: number;
  overtimeRates: {
    regular: number;
    holiday: number;
  };
  allowances: {
    transportation: number;
    meal: number;
    housing: number;
  };
  deductions: {
    socialSecurity: number;
    tax: number;
  };
  workingHours: {
    regularHoursPerDay: number;
    regularDaysPerWeek: number;
  };
  leaveSettings: {
    sickLeavePerYear: number;
    annualLeavePerYear: number;
    businessLeavePerYear: number;
  };
}

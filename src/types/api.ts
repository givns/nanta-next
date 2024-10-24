// types/api.ts

/**
 * Response type for payroll summary endpoint
 */
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
  };
}

/**
 * Response type for payroll periods endpoint
 */
export interface PayrollPeriodResponse {
  periods: Array<{
    id: string;
    startDate: string;
    endDate: string;
    status: PayrollPeriodStatus;
    isCurrentPeriod: boolean;
  }>;
  currentPeriod: {
    startDate: string;
    endDate: string;
  };
}

/**
 * Response type for payroll settings endpoint
 */
export interface PayrollSettings {
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
  leaveSettings: {
    sickLeavePerYear: number;
    annualLeavePerYear: number;
    businessLeavePerYear: number;
  };
  workingHours: {
    regularHoursPerDay: number;
    regularDaysPerWeek: number;
  };
}

/**
 * Payroll calculation details
 */
export interface PayrollCalculation {
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  holidayOvertimeHours: number;
  leaveHours: {
    sick: number;
    business: number;
    annual: number;
    unpaid: number;
  };
  adjustments: PayrollAdjustment[];
}

/**
 * Payroll adjustment entry
 */
export interface PayrollAdjustment {
  type: PayrollAdjustmentType;
  amount: number;
  description: string;
  date: string;
}

/**
 * Status of a payroll period
 */
export type PayrollPeriodStatus =
  | 'processing' // Period is currently being processed
  | 'completed' // Processing complete, ready for review
  | 'approved' // Approved for payment
  | 'paid' // Payment has been processed
  | 'error'; // Error occurred during processing

/**
 * Types of payroll adjustments
 */
export type PayrollAdjustmentType =
  | 'bonus'
  | 'deduction'
  | 'allowance'
  | 'correction'
  | 'other';

/**
 * Daily payroll record
 */
export interface DailyPayrollRecord {
  date: string;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  holidayOvertimeHours: number;
  status: 'pending' | 'processed';
  lateMinutes: number;
  earlyLeaveMinutes: number;
}

/**
 * Payroll processing result
 */
export interface PayrollProcessingResult {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  totalOvertimeHours: number;
  totalRegularHours: number;
  processedData: {
    basePay: number;
    overtimePay: number;
    holidayPay: number;
    allowances: number;
    deductions: {
      socialSecurity: number;
      tax: number;
      other: number;
    };
    adjustments: PayrollAdjustment[];
    netPayable: number;
  };
}

/**
 * Employee payroll summary for dashboard display
 */
export interface EmployeePayrollSummary {
  currentPeriod: {
    start: string;
    end: string;
    daysWorked: number;
    regularHours: number;
    overtimeHours: number;
    estimatedEarnings: number;
  };
  previousPeriod: {
    start: string;
    end: string;
    netPayable: number;
    paymentStatus: 'pending' | 'processed' | 'paid';
    paymentDate?: string;
  };
  yearToDate: {
    totalEarnings: number;
    totalOvertimeHours: number;
    leavesTaken: {
      sick: number;
      annual: number;
      business: number;
      unpaid: number;
    };
  };
}

/**
 * Error response for payroll API endpoints
 */
export interface PayrollErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

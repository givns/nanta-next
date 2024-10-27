// types/payroll-calculation.ts

export type EmployeeBaseType = 'FULLTIME' | 'PARTTIME';
export type EmployeeStatus = 'PROBATION' | 'REGULAR';

export interface PayrollRates {
  // Common rates
  socialSecurityRate: number;
  socialSecurityMinBase: number; // 1650
  socialSecurityMaxBase: number; // 15000

  // Overtime rates
  workdayOvertimeRate: number; // 1.5
  weekendShiftOvertimeRate: {
    fulltime: number; // 1.0
    parttime: number; // 2.0
  };
  holidayOvertimeRate: number; // 3.0

  // Allowances
  mealAllowancePerDay: number; // 30 for parttime
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

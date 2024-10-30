// services/PayrollCalculation/PayrollCalculationService.ts

import { TimeEntry, User, LeaveRequest, Holiday, EmployeeType } from '@prisma/client';

interface PayrollSettings {
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

export class PayrollCalculationService {
  constructor(private settings: PayrollSettings) {}

  calculateOvertimeHours(minutes: number): number {
    if (minutes < this.settings.rules.overtimeMinimumMinutes) {
      return 0;
    }
    
    // Round to the nearest interval
    const roundTo = this.settings.rules.roundOvertimeTo;
    return Math.round(minutes / roundTo) * roundTo / 60;
  }

  calculateOvertimePay(
    hours: number,
    hourlyRate: number,
    employeeType: EmployeeType,
    isInsideShift: boolean,
    isDayOffOvertime: boolean
  ): number {
    const rates = this.settings.overtimeRates[employeeType];
    let rate: number;

    if (isDayOffOvertime) {
      if (isInsideShift) {
        // Weekend/Holiday during shift hours
        rate = employeeType === EmployeeType.Fulltime 
          ? rates.weekendInsideShiftFulltime 
          : rates.weekendInsideShiftParttime;
      } else {
        // Weekend/Holiday outside shift hours
        rate = rates.weekendOutsideShift;
      }
    } else {
      // Regular workday overtime
      rate = rates.workdayOutsideShift;
    }

    return hours * hourlyRate * rate;
  }

  calculateAllowances(employee: User, workDays: number) {
    return {
      transportation: this.settings.allowances.transportation,
      meal: this.settings.allowances.meal[employee.employeeType] * workDays,
      housing: this.settings.allowances.housing
    };
  }

  calculateDeductions(grossPay: number) {
    const socialSecurityBase = Math.min(
      Math.max(
        grossPay,
        this.settings.deductions.socialSecurityMinBase
      ),
      this.settings.deductions.socialSecurityMaxBase
    );

    return {
      socialSecurity: socialSecurityBase * this.settings.deductions.socialSecurityRate,
      tax: 0, // Implement tax calculation if needed
    };
  }

  // Example usage in processTimeEntry
  async processTimeEntry(timeEntry: TimeEntry & { overtimeMetadata: string | null }) {
    const overtimeMinutes = 
      timeEntry.overtimeHours > 0 
        ? timeEntry.overtimeHours * 60 
        : 0;

    const overtimeHours = this.calculateOvertimeHours(overtimeMinutes);

    if (overtimeHours > 0 && timeEntry.overtimeMetadata) {
      const metadata = JSON.parse(timeEntry.overtimeMetadata);
      
      // Calculate overtime pay using the configured rates
      const overtimePay = this.calculateOvertimePay(
        overtimeHours,
        hourlyRate,
        employee.employeeType,
        metadata.isInsideShiftHours,
        metadata.isDayOffOvertime
      );

      return {
        regularHours: timeEntry.regularHours,
        overtimeHours,
        overtimePay
      };
    }

    return {
      regularHours: timeEntry.regularHours,
      overtimeHours: 0,
      overtimePay: 0
    };
  }
}

// Helper function to initialize the service
export async function initializePayrollService(prisma: PrismaClient) {
  const settings = await prisma.payrollSettings.findFirst();
  if (!settings) {
    throw new Error('Payroll settings not found');
  }

  const parsedSettings: PayrollSettings = {
    overtimeRates: JSON.parse(settings.overtimeRates as string),
    allowances: JSON.parse(settings.allowances as string),
    deductions: JSON.parse(settings.deductions as string),
    rules: JSON.parse(settings.overtimeRates as string).rules
  };

  return new PayrollCalculationService(parsedSettings);
}
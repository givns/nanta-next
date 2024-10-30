// services/PayrollCalculation/PayrollCalculationService.ts

import { PrismaClient, TimeEntry, User, EmployeeType } from '@prisma/client';
import { PayrollSettings } from '@/types/payroll';
import { PayrollCalculationResult } from '@/types/payroll/api';

interface PayrollResult {
  regularHours: number;
  overtimeBreakdown: {
    workdayOutside: { hours: number; amount: number };
    weekendInside: { hours: number; amount: number };
    weekendOutside: { hours: number; amount: number };
  };
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
}

export class PayrollCalculationService {
  private hourlyRate: number = 0;

  constructor(private settings: PayrollSettings) {}

  async calculatePayroll(
    employee: User,
    timeEntries: TimeEntry[],
    leaveRequests: any[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PayrollCalculationResult> {
    this.setHourlyRate(employee);

    // Process time entries
    const processedTime = this.processTimeEntries(timeEntries, employee);
    const workDays = Math.ceil(processedTime.regularHours / 8);

    // Calculate allowances
    const allowances = this.calculateAllowances(employee, workDays);

    // Calculate gross pay including overtime
    const grossPay =
      processedTime.regularHours * this.hourlyRate +
      processedTime.overtimeBreakdown.workdayOutside.amount +
      processedTime.overtimeBreakdown.weekendInside.amount +
      processedTime.overtimeBreakdown.weekendOutside.amount +
      Object.values(allowances).reduce((sum, val) => sum + val, 0);

    // Calculate deductions
    const deductions = this.calculateDeductions(grossPay);

    return {
      regularHours: processedTime.regularHours,
      overtimeBreakdown: processedTime.overtimeBreakdown,
      allowances,
      deductions,
      netPayable: grossPay - deductions.total,
    };
  }

  private processTimeEntries(timeEntries: TimeEntry[], employee: User) {
    let regularHours = 0;
    const overtimeBreakdown = {
      workdayOutside: { hours: 0, amount: 0 },
      weekendInside: { hours: 0, amount: 0 },
      weekendOutside: { hours: 0, amount: 0 },
    };

    timeEntries.forEach((entry) => {
      regularHours += entry.regularHours;

      if (entry.overtimeHours > 0 && entry.overtimeMetadata) {
        const metadata = JSON.parse(entry.overtimeMetadata);
        const overtimeHours = this.calculateOvertimeHours(
          entry.overtimeHours * 60,
        );

        if (metadata.isDayOffOvertime) {
          if (metadata.isInsideShiftHours) {
            overtimeBreakdown.weekendInside.hours += overtimeHours;
            overtimeBreakdown.weekendInside.amount += this.calculateOvertimePay(
              overtimeHours,
              this.hourlyRate,
              employee.employeeType,
              true,
              true,
            );
          } else {
            overtimeBreakdown.weekendOutside.hours += overtimeHours;
            overtimeBreakdown.weekendOutside.amount +=
              this.calculateOvertimePay(
                overtimeHours,
                this.hourlyRate,
                employee.employeeType,
                false,
                true,
              );
          }
        } else {
          overtimeBreakdown.workdayOutside.hours += overtimeHours;
          overtimeBreakdown.workdayOutside.amount += this.calculateOvertimePay(
            overtimeHours,
            this.hourlyRate,
            employee.employeeType,
            false,
            false,
          );
        }
      }
    });

    return { regularHours, overtimeBreakdown };
  }

  calculateOvertimeHours(minutes: number): number {
    if (minutes < this.settings.rules.overtimeMinimumMinutes) {
      return 0;
    }

    // Round to the nearest interval
    const roundTo = this.settings.rules.roundOvertimeTo;
    return (Math.round(minutes / roundTo) * roundTo) / 60;
  }

  calculateOvertimePay(
    hours: number,
    hourlyRate: number,
    employeeType: EmployeeType,
    isInsideShift: boolean,
    isDayOffOvertime: boolean,
  ): number {
    const rates = this.settings.overtimeRates[employeeType];
    let rate: number;

    if (isDayOffOvertime) {
      if (isInsideShift) {
        // Weekend/Holiday during shift hours
        rate =
          employeeType === EmployeeType.Fulltime
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
      housing: this.settings.allowances.housing,
    };
  }

  private setHourlyRate(employee: User) {
    if (!employee.baseSalary) {
      this.hourlyRate = 0;
      return;
    }
    this.hourlyRate =
      employee.salaryType === 'monthly'
        ? employee.baseSalary / 176
        : employee.baseSalary / 8;
  }

  calculateDeductions(grossPay: number) {
    const socialSecurityBase = Math.min(
      Math.max(grossPay, this.settings.deductions.socialSecurityMinBase),
      this.settings.deductions.socialSecurityMaxBase,
    );

    return {
      socialSecurity:
        socialSecurityBase * this.settings.deductions.socialSecurityRate,
      tax: 0, // Implement tax calculation if needed
    };
  }

  // Example usage in processTimeEntry
  async processTimeEntry(
    timeEntry: TimeEntry & {
      overtimeMetadata: {
        isInsideShiftHours: boolean;
        isDayOffOvertime: boolean;
      } | null;
    },
    employee: User,
  ) {
    const overtimeMinutes = timeEntry.overtimeHours * 60;
    const overtimeHours = this.calculateOvertimeHours(overtimeMinutes);

    this.setHourlyRate(employee);

    if (overtimeHours > 0 && timeEntry.overtimeMetadata) {
      const { isInsideShiftHours, isDayOffOvertime } =
        timeEntry.overtimeMetadata;

      const overtimePay = this.calculateOvertimePay(
        overtimeHours,
        this.hourlyRate,
        employee.employeeType,
        isInsideShiftHours,
        isDayOffOvertime,
      );

      return {
        regularHours: timeEntry.regularHours,
        overtimeHours,
        overtimePay,
      };
    }

    return {
      regularHours: timeEntry.regularHours,
      overtimeHours: 0,
      overtimePay: 0,
    };
  }
}

// Helper function to initialize the service
// Initialize service helper
export async function initializePayrollService(prisma: PrismaClient) {
  const settings = await prisma.payrollSettings.findFirst();
  if (!settings) {
    throw new Error('Payroll settings not found');
  }

  return new PayrollCalculationService({
    overtimeRates: JSON.parse(settings.overtimeRates as string),
    allowances: JSON.parse(settings.allowances as string),
    deductions: JSON.parse(settings.deductions as string),
    rules: JSON.parse(settings.overtimeRates as string).rules,
  });
}

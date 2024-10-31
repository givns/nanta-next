// utils/payrollUtils.ts
import {
  addMonths,
  format,
  startOfYear,
  endOfMonth,
  subMonths,
  parse,
} from 'date-fns';
import { PayrollCalculationResult, PayrollSettings } from '@/types/payroll';
import { EmployeeType } from '@prisma/client';

// Existing period interfaces
export interface PayrollPeriod {
  label: string;
  value: string;
  start: string;
  end: string;
}

export class PayrollUtils {
  // Keep existing period calculation functions
  static generatePayrollPeriods(currentDate = new Date()): PayrollPeriod[] {
    const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
    const periods: PayrollPeriod[] = [];

    let startDate = startOfYear(currentDate);
    startDate = subMonths(startDate, 1); // Start from December of previous year
    startDate.setDate(26);

    while (startDate <= currentDate) {
      const endDate = endOfMonth(addMonths(startDate, 1));
      endDate.setDate(25);

      const periodLabel = format(addMonths(startDate, 1), 'MMMM yyyy');
      const period: PayrollPeriod = {
        label: periodLabel,
        value: periodLabel.toLowerCase().replace(' ', '-'),
        start: formatDate(startDate),
        end: formatDate(endDate),
      };

      periods.push(period);
      startDate = addMonths(startDate, 1);
    }

    // Add "Current" period
    const currentPeriod = periods[periods.length - 1];
    periods.push({
      label: 'Current',
      value: 'current',
      start: currentPeriod.start,
      end: currentPeriod.end,
    });

    return periods;
  }

  static getCurrentPayrollPeriod(currentDate = new Date()): PayrollPeriod {
    const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();

    let startDate: Date;
    let endDate: Date;

    if (day < 26) {
      startDate = new Date(year, month - 1, 26);
      endDate = new Date(year, month, 25);
    } else {
      startDate = new Date(year, month, 26);
      endDate = new Date(year, month + 1, 25);
    }

    endDate = endOfMonth(endDate) < endDate ? endOfMonth(endDate) : endDate;

    return {
      label: 'Current',
      value: 'current',
      start: formatDate(startDate),
      end: formatDate(endDate),
    };
  }

  static isCurrentPeriod(period: PayrollPeriod): boolean {
    const currentPeriod = this.getCurrentPayrollPeriod();
    return (
      period.start === currentPeriod.start && period.end === currentPeriod.end
    );
  }

  // New calculation methods from the previous implementation
  static calculateOvertimePay(
    hours: PayrollCalculationResult['hours'],
    baseRate: number,
    employeeType: EmployeeType,
    settings: PayrollSettings,
  ): number {
    const rates = settings.overtimeRates[employeeType];

    return (
      hours.workdayOvertimeHours * baseRate * rates.workdayOutsideShift +
      hours.weekendShiftOvertimeHours *
        baseRate *
        (employeeType === EmployeeType.Fulltime
          ? rates.weekendInsideShiftFulltime
          : rates.weekendInsideShiftParttime) +
      hours.holidayOvertimeHours * baseRate * rates.weekendOutsideShift
    );
  }

  static calculateSocialSecurity(
    grossPay: number,
    settings: PayrollSettings,
  ): number {
    const base = Math.min(
      Math.max(grossPay, settings.deductions.socialSecurityMinBase),
      settings.deductions.socialSecurityMaxBase,
    );
    return base * settings.deductions.socialSecurityRate;
  }

  static formatCurrency(amount: number): string {
    return amount.toLocaleString('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2,
    });
  }

  static validatePayrollData(data: PayrollCalculationResult): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data.employee?.id) errors.push('Missing employee ID');
    if (!data.processedData?.netPayable)
      errors.push('Missing net payable amount');

    const totalOvertime =
      data.hours.workdayOvertimeHours +
      data.hours.weekendShiftOvertimeHours +
      data.hours.holidayOvertimeHours;

    if (totalOvertime > 0 && !data.processedData.overtimePay) {
      errors.push('Overtime hours present but no overtime pay calculated');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Helper method to get period dates from value
  static getPeriodDates(periodValue: string): {
    startDate: Date;
    endDate: Date;
  } {
    if (periodValue === 'current') {
      const currentPeriod = this.getCurrentPayrollPeriod();
      return {
        startDate: parse(currentPeriod.start, 'yyyy-MM-dd', new Date()),
        endDate: parse(currentPeriod.end, 'yyyy-MM-dd', new Date()),
      };
    }

    // Handle period values in format "month-yyyy" (e.g., "january-2024")
    const [month, year] = periodValue.split('-');
    const date = parse(`01 ${month} ${year}`, 'dd MMMM yyyy', new Date());

    return {
      startDate: new Date(date.getFullYear(), date.getMonth(), 26),
      endDate: new Date(date.getFullYear(), date.getMonth() + 1, 25),
    };
  }
}

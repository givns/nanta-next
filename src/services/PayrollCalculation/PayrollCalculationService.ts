// services/PayrollCalculation/PayrollCalculationService.ts
// REPLACEMENT: This is a complete replacement of the existing service

import {
  PrismaClient,
  User,
  TimeEntry,
  LeaveRequest,
  EmployeeType,
} from '@prisma/client';
import { PayrollCalculationResult, PayrollSettings } from '@/types/payroll';
import { formatISO } from 'date-fns';

export class PayrollCalculationService {
  constructor(
    private settings: PayrollSettings,
    private prisma: PrismaClient,
  ) {}

  async calculatePayroll(
    employee: User,
    timeEntries: TimeEntry[],
    leaveRequests: LeaveRequest[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PayrollCalculationResult> {
    try {
      // Process time entries
      const hours = this.calculateWorkingHours(timeEntries);

      // Calculate attendance metrics
      const attendance = this.calculateAttendance(timeEntries);

      // Process leaves
      const leaves = this.calculateLeaves(leaveRequests);

      // Calculate rates
      const rates = this.calculateRates(employee);

      // Calculate processed data (financial calculations)
      const processedData = this.calculateFinancials(
        employee,
        hours,
        attendance,
        rates,
      );

      return {
        employee: {
          id: employee.id,
          employeeId: employee.employeeId,
          name: employee.name,
          departmentName: employee.departmentName,
          role: employee.role,
          employeeType: employee.employeeType,
        },
        summary: {
          totalWorkingDays: this.calculateTotalWorkingDays(
            periodStart,
            periodEnd,
          ),
          totalPresent: Math.ceil(hours.regularHours / 8),
          totalAbsent: leaves.unpaid,
        },
        hours,
        attendance,
        leaves,
        rates,
        processedData,
      };
    } catch (error) {
      console.error('Error calculating payroll:', error);
      throw new Error('Failed to calculate payroll');
    }
  }

  private calculateWorkingHours(timeEntries: TimeEntry[]) {
    return timeEntries.reduce(
      (acc, entry) => ({
        regularHours: acc.regularHours + entry.regularHours,
        workdayOvertimeHours:
          acc.workdayOvertimeHours +
          (entry.overtimeMetadata?.isDayOffOvertime ? 0 : entry.overtimeHours),
        weekendShiftOvertimeHours:
          acc.weekendShiftOvertimeHours +
          (entry.overtimeMetadata?.isDayOffOvertime &&
          entry.overtimeMetadata?.isInsideShiftHours
            ? entry.overtimeHours
            : 0),
        holidayOvertimeHours:
          acc.holidayOvertimeHours +
          (entry.overtimeMetadata?.isDayOffOvertime &&
          !entry.overtimeMetadata?.isInsideShiftHours
            ? entry.overtimeHours
            : 0),
      }),
      {
        regularHours: 0,
        workdayOvertimeHours: 0,
        weekendShiftOvertimeHours: 0,
        holidayOvertimeHours: 0,
      },
    );
  }

  private calculateAttendance(timeEntries: TimeEntry[]) {
    return timeEntries.reduce(
      (acc, entry) => ({
        totalLateMinutes: acc.totalLateMinutes + (entry.actualMinutesLate || 0),
        earlyDepartures:
          acc.earlyDepartures +
          (entry.endTime ? this.calculateEarlyDeparture(entry.endTime) : 0),
      }),
      { totalLateMinutes: 0, earlyDepartures: 0 },
    );
  }

  private calculateLeaves(leaveRequests: LeaveRequest[]) {
    return leaveRequests.reduce(
      (acc, leave) => ({
        ...acc,
        [leave.leaveType.toLowerCase()]:
          acc[leave.leaveType.toLowerCase()] + leave.fullDayCount,
      }),
      { sick: 0, annual: 0, business: 0, holidays: 0, unpaid: 0 },
    );
  }

  private calculateRates(employee: User) {
    const baseHourlyRate = employee.baseSalary
      ? employee.salaryType === 'monthly'
        ? employee.baseSalary / 176 // Standard monthly hours
        : employee.baseSalary
      : 0;

    return {
      regularHourlyRate: baseHourlyRate,
      overtimeRate:
        this.settings.overtimeRates[employee.employeeType].workdayOutsideShift,
    };
  }

  private calculateFinancials(
    employee: User,
    hours: PayrollCalculationResult['hours'],
    attendance: PayrollCalculationResult['attendance'],
    rates: PayrollCalculationResult['rates'],
  ) {
    // Calculate base pay
    const basePay = hours.regularHours * rates.regularHourlyRate;

    // Calculate overtime pay
    const overtimePay = this.calculateOvertimePay(
      hours,
      rates.regularHourlyRate,
      employee.employeeType,
    );

    // Calculate allowances
    const allowances = {
      transportation: this.settings.allowances.transportation,
      meal:
        this.settings.allowances.meal[employee.employeeType] *
        Math.ceil(hours.regularHours / 8),
      housing: this.settings.allowances.housing,
    };

    // Calculate deductions
    const grossPay =
      basePay +
      overtimePay +
      Object.values(allowances).reduce((a, b) => a + b, 0);
    const deductions = this.calculateDeductions(grossPay);

    return {
      basePay,
      overtimePay,
      allowances,
      deductions,
      netPayable: grossPay - deductions.total,
    };
  }

  private calculateOvertimePay(
    hours: PayrollCalculationResult['hours'],
    regularHourlyRate: number,
    employeeType: EmployeeType,
  ) {
    const rates = this.settings.overtimeRates[employeeType];

    return (
      hours.workdayOvertimeHours *
        regularHourlyRate *
        rates.workdayOutsideShift +
      hours.weekendShiftOvertimeHours *
        regularHourlyRate *
        (employeeType === EmployeeType.Fulltime
          ? rates.weekendInsideShiftFulltime
          : rates.weekendInsideShiftParttime) +
      hours.holidayOvertimeHours * regularHourlyRate * rates.weekendOutsideShift
    );
  }

  private calculateDeductions(grossPay: number) {
    const socialSecurityBase = Math.min(
      Math.max(grossPay, this.settings.deductions.socialSecurityMinBase),
      this.settings.deductions.socialSecurityMaxBase,
    );

    const socialSecurity =
      socialSecurityBase * this.settings.deductions.socialSecurityRate;
    const tax = this.calculateTax(grossPay);

    return {
      socialSecurity,
      tax,
      unpaidLeave: 0, // Calculate based on leave records if needed
      total: socialSecurity + tax,
    };
  }

  private calculateTax(grossPay: number): number {
    // Simplified progressive tax calculation
    if (grossPay <= 20000) return 0;

    let tax = 0;
    let remainingPay = grossPay;

    if (remainingPay > 20000) {
      const taxableAmount = Math.min(remainingPay - 20000, 10000);
      tax += taxableAmount * 0.05;
      remainingPay -= taxableAmount;
    }

    if (remainingPay > 30000) {
      const taxableAmount = Math.min(remainingPay - 30000, 20000);
      tax += taxableAmount * 0.1;
      remainingPay -= taxableAmount;
    }

    if (remainingPay > 50000) {
      tax += (remainingPay - 50000) * 0.15;
    }

    return tax;
  }

  private calculateTotalWorkingDays(start: Date, end: Date): number {
    // Implementation needed based on your business rules
    return 22; // Placeholder - typical working days in a month
  }

  private calculateEarlyDeparture(endTime: Date): number {
    // Implementation needed based on your business rules
    return 0;
  }
}

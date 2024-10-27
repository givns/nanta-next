// services/PayrollRatesService.ts

import { PayrollRates } from '@/types/payroll';
import { EmployeeType } from '@prisma/client';

export class PayrollRatesService {
  private defaultRates: PayrollRates = {
    socialSecurityRate: 0.05,
    socialSecurityMinBase: 1650,
    socialSecurityMaxBase: 15000,
    workdayOvertimeRate: 1.5,
    weekendShiftOvertimeRate: {
      fulltime: 1.0,
      parttime: 2.0,
    },
    holidayOvertimeRate: 3.0,
    mealAllowancePerDay: 30,
  };

  private employeeTypeRates: Record<EmployeeType, Partial<PayrollRates>> = {
    [EmployeeType.Fulltime]: {
      workdayOvertimeRate: 1.5,
      weekendShiftOvertimeRate: {
        fulltime: 1.0,
        parttime: 2.0,
      },
      holidayOvertimeRate: 3.0,
      mealAllowancePerDay: 0, // Fulltime doesn't get daily meal allowance
    },
    [EmployeeType.Parttime]: {
      workdayOvertimeRate: 1.5,
      weekendShiftOvertimeRate: {
        fulltime: 1.0,
        parttime: 2.0,
      },
      holidayOvertimeRate: 3.0,
      mealAllowancePerDay: 30,
    },
    [EmployeeType.Probation]: {
      // Probation rates can be adjusted based on policy
      workdayOvertimeRate: 1.5,
      weekendShiftOvertimeRate: {
        fulltime: 1.0,
        parttime: 2.0,
      },
      holidayOvertimeRate: 3.0,
      mealAllowancePerDay: 0,
    },
  };

  getRatesForEmployeeType(
    employeeType: EmployeeType,
    baseSalary: number,
    salaryType: 'monthly' | 'daily',
  ): PayrollRates {
    const baseRates = this.defaultRates;
    const specificRates = this.employeeTypeRates[employeeType];

    // Calculate hourly rate based on salary type
    const hourlyRate =
      salaryType === 'monthly' ? baseSalary / 30 / 8 : baseSalary / 8;

    return {
      ...baseRates,
      ...specificRates,
      hourlyRate,
    };
  }

  calculateSocialSecurity(amount: number): number {
    if (amount < this.defaultRates.socialSecurityMinBase) {
      return Math.round(
        this.defaultRates.socialSecurityMinBase *
          this.defaultRates.socialSecurityRate,
      );
    }

    if (amount > this.defaultRates.socialSecurityMaxBase) {
      return Math.round(
        this.defaultRates.socialSecurityMaxBase *
          this.defaultRates.socialSecurityRate,
      );
    }

    return Math.round(amount * this.defaultRates.socialSecurityRate);
  }

  calculateOvertimeRate(
    employeeType: EmployeeType,
    isHoliday: boolean,
    isWeekend: boolean,
  ): number {
    if (isHoliday) {
      return this.defaultRates.holidayOvertimeRate;
    }

    if (isWeekend) {
      return employeeType === EmployeeType.Fulltime
        ? this.defaultRates.weekendShiftOvertimeRate.fulltime
        : this.defaultRates.weekendShiftOvertimeRate.parttime;
    }

    return this.defaultRates.workdayOvertimeRate;
  }
}

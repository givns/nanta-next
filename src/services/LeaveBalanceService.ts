// services/LeaveBalanceService.ts
export class LeaveBalanceService {
  private static SICK_LEAVE_PER_YEAR = 30;
  private static BUSINESS_LEAVE_PER_YEAR = 3;
  private static ANNUAL_LEAVE_PER_YEAR = 6;
  private static ANNUAL_LEAVE_RATE_PER_MONTH = 0.5;
  private static PROBATION_MONTHS = 4;

  static calculateInitialLeaveBalances(
    workStartDate: Date,
    employeeType: string,
  ) {
    const now = new Date();
    const startMonth = new Date(workStartDate);
    const monthsWorked = this.getMonthsDifference(startMonth, now);

    // Default balances
    const sickLeave = this.SICK_LEAVE_PER_YEAR;
    const businessLeave = this.BUSINESS_LEAVE_PER_YEAR;
    let annualLeave = 0;

    // Calculate annual leave only if not in probation
    if (employeeType !== 'Probation' && monthsWorked > this.PROBATION_MONTHS) {
      const monthsForAnnualLeave = monthsWorked - this.PROBATION_MONTHS;
      annualLeave = Math.min(
        this.ANNUAL_LEAVE_PER_YEAR,
        monthsForAnnualLeave * this.ANNUAL_LEAVE_RATE_PER_MONTH,
      );
    }

    return {
      sickLeaveBalance: sickLeave,
      businessLeaveBalance: businessLeave,
      annualLeaveBalance: annualLeave,
    };
  }

  static calculateCurrentLeaveBalances(
    workStartDate: Date,
    employeeType: string,
    usedLeaves: {
      sick: number;
      business: number;
      annual: number;
    },
  ) {
    const initial = this.calculateInitialLeaveBalances(
      workStartDate,
      employeeType,
    );

    return {
      sickLeave: {
        total: initial.sickLeaveBalance,
        used: usedLeaves.sick,
        remaining: initial.sickLeaveBalance - usedLeaves.sick,
      },
      businessLeave: {
        total: initial.businessLeaveBalance,
        used: usedLeaves.business,
        remaining: initial.businessLeaveBalance - usedLeaves.business,
      },
      annualLeave: {
        total: initial.annualLeaveBalance,
        used: usedLeaves.annual,
        remaining: initial.annualLeaveBalance - usedLeaves.annual,
      },
    };
  }

  private static getMonthsDifference(startDate: Date, endDate: Date): number {
    return (
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      endDate.getMonth() -
      startDate.getMonth()
    );
  }

  static resetYearlyBalances(workStartDate: Date, employeeType: string) {
    console.log('Resetting yearly balances for', employeeType);
    const monthsWorked = this.getMonthsDifference(workStartDate, new Date());

    return {
      sickLeaveBalance: this.SICK_LEAVE_PER_YEAR,
      businessLeaveBalance: this.BUSINESS_LEAVE_PER_YEAR,
      annualLeaveBalance:
        monthsWorked >= 12
          ? this.ANNUAL_LEAVE_PER_YEAR
          : monthsWorked > this.PROBATION_MONTHS
            ? (monthsWorked - this.PROBATION_MONTHS) *
              this.ANNUAL_LEAVE_RATE_PER_MONTH
            : 0,
    };
  }
}

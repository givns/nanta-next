// services/PayrollCalculation/PayrollCalculationService.ts

import {
  PrismaClient,
  User,
  TimeEntry,
  LeaveRequest,
  EmployeeType,
} from '@prisma/client';
import {
  PayrollCalculationResult,
  PayrollSettingsData,
  OvertimeHoursByType,
  OvertimeRatesByType,
  OvertimePayByType,
  PayrollStatus,
} from '@/types/payroll';
import { differenceInBusinessDays, isSameDay, isWeekend, min } from 'date-fns';
import { ShiftManagementService } from '../ShiftManagementService';
import { HolidayService } from '../HolidayService';

interface TimeEntryWithMetadata extends TimeEntry {
  overtimeMetadata?: {
    id: string;
    timeEntryId: string;
    isInsideShiftHours: boolean;
    isDayOffOvertime: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}

export class PayrollCalculationService {
  private shiftManagementService: ShiftManagementService;

  constructor(
    private settings: PayrollSettingsData,
    private prisma: PrismaClient,
    private holidayService: HolidayService,
  ) {
    this.shiftManagementService = new ShiftManagementService(
      prisma,
      holidayService,
    );
  }

  async calculatePayroll(
    employee: User,
    timeEntries: TimeEntryWithMetadata[],
    leaveRequests: LeaveRequest[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PayrollCalculationResult> {
    try {
      // Basic employee info
      const employeeInfo = {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        departmentName: employee.departmentName,
        role: employee.role,
        employeeType: employee.employeeType,
      };

      // Calculate total working days first as it's needed for other calculations
      const totalWorkingDays = await this.calculateTotalWorkingDays(
        employee,
        periodStart,
        periodEnd,
      );

      // Hours calculations
      const { regularHours, overtimeHoursByType, totalOvertimeHours } =
        this.calculateWorkingHours(timeEntries);

      // Calculate rates
      const { regularHourlyRate, overtimeRatesByType } =
        this.calculateRates(employee);

      // Calculate overtime pay
      const { overtimePayByType, totalOvertimePay } = this.calculateOvertimePay(
        overtimeHoursByType,
        regularHourlyRate,
        employee.employeeType,
      );

      // Calculate base pay
      const basePay = this.calculateBasePay(regularHours, regularHourlyRate);

      // Attendance calculations
      const { totalLateMinutes, earlyDepartures } =
        this.calculateAttendance(timeEntries);

      // Leave calculations
      const leaves = this.calculateLeaves(leaveRequests);

      // Calculate present days based on time entries
      const totalPresent = Math.ceil(
        timeEntries.reduce((sum, entry) => sum + entry.regularHours, 0) / 8,
      );

      // Calculate absents using the effective end date
      const currentDate = new Date();
      const effectiveEndDate = min([currentDate, periodEnd]);
      const totalAbsent = totalWorkingDays - totalPresent - leaves.holidays;

      // Calculate allowances
      const allowances = this.calculateAllowances(
        employee.employeeType,
        totalWorkingDays,
      );

      // Calculate gross pay for deductions
      const grossPay = basePay + totalOvertimePay + allowances.totalAllowances;

      // Calculate deductions
      const deductions = this.calculateDeductions(
        grossPay,
        leaves.unpaidLeaveDays,
        regularHourlyRate,
      );

      // Calculate commission if applicable
      const commission = await this.calculateCommission(
        employee,
        periodStart,
        periodEnd,
      );

      // Calculate final net payable
      const netPayable =
        basePay +
        totalOvertimePay +
        allowances.totalAllowances -
        deductions.totalDeductions +
        (commission?.commissionAmount || 0) +
        (commission?.quarterlyBonus || 0) +
        (commission?.yearlyBonus || 0);

      return {
        // Employee Information
        employee: employeeInfo,

        // Hours
        regularHours,
        overtimeHoursByType,
        totalOvertimeHours,

        // Attendance
        totalWorkingDays,
        totalPresent,
        totalAbsent,
        totalLateMinutes,
        earlyDepartures,

        // Leaves
        sickLeaveDays: leaves.sickLeaveDays,
        businessLeaveDays: leaves.businessLeaveDays,
        annualLeaveDays: leaves.annualLeaveDays,
        unpaidLeaveDays: leaves.unpaidLeaveDays,
        holidays: leaves.holidays,

        // Rates
        regularHourlyRate,
        overtimeRatesByType,

        // Calculations
        basePay,
        overtimePayByType,
        totalOvertimePay,

        // Allowances
        transportationAllowance: allowances.transportationAllowance,
        mealAllowance: allowances.mealAllowance,
        housingAllowance: allowances.housingAllowance,
        totalAllowances: allowances.totalAllowances,

        // Deductions
        socialSecurity: deductions.socialSecurity,
        tax: deductions.tax,
        unpaidLeaveDeduction: deductions.unpaidLeaveDeduction,
        totalDeductions: deductions.totalDeductions,

        // Commission (if applicable)
        ...(commission && {
          salesAmount: commission.salesAmount,
          commissionRate: commission.commissionRate,
          commissionAmount: commission.commissionAmount,
          quarterlyBonus: commission.quarterlyBonus,
          yearlyBonus: commission.yearlyBonus,
        }),

        // Final amounts and status
        netPayable,
        status: 'draft' as PayrollStatus,
      };
    } catch (error) {
      console.error('Error calculating payroll:', error);
      throw new Error('Failed to calculate payroll');
    }
  }

  private async calculateTotalWorkingDays(
    employee: User,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // Get the current date
    const currentDate = new Date();

    // Use the earlier of current date or period end date
    const effectiveEndDate = min([currentDate, endDate]);

    // Get shift data
    const shiftData = employee.shiftCode
      ? await this.shiftManagementService.getShiftByCode(employee.shiftCode)
      : null;
    if (!shiftData) {
      throw new Error(`Shift not found for code: ${employee.shiftCode}`);
    }

    // Get holidays within the period
    const holidays = await this.prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: effectiveEndDate,
        },
      },
    });

    // Function to check if a date is a working day based on shift
    const isWorkingDay = (date: Date): boolean => {
      // Get day of week (0 = Sunday, 1 = Monday, etc.)
      const dayOfWeek = date.getDay();

      // Check if this day is in the shift's workDays
      return shiftData.workDays.includes(dayOfWeek);
    };

    // Count working days
    let workingDaysCount = 0;
    let currentDatePointer = new Date(startDate);

    while (currentDatePointer <= effectiveEndDate) {
      if (isWorkingDay(currentDatePointer)) {
        // Check if this day is not a holiday
        const isHoliday = holidays.some((holiday) =>
          isSameDay(holiday.date, currentDatePointer),
        );

        if (!isHoliday) {
          workingDaysCount++;
        }
      }

      // Move to next day
      currentDatePointer.setDate(currentDatePointer.getDate() + 1);
    }

    return workingDaysCount;
  }

  private calculateWorkingHours(timeEntries: TimeEntryWithMetadata[]): {
    regularHours: number;
    overtimeHoursByType: OvertimeHoursByType;
    totalOvertimeHours: number;
  } {
    const overtimeHours: OvertimeHoursByType = {
      workdayOutside: 0,
      weekendInside: 0,
      weekendOutside: 0,
      holidayRegular: 0,
      holidayOvertime: 0,
    };

    let regularHours = 0;

    timeEntries.forEach((entry) => {
      regularHours += entry.regularHours;

      if (entry.overtimeHours > 0 && entry.overtimeMetadata) {
        const { isDayOffOvertime, isInsideShiftHours } = entry.overtimeMetadata;

        if (isDayOffOvertime) {
          if (isInsideShiftHours) {
            overtimeHours.holidayRegular += entry.overtimeHours;
          } else {
            overtimeHours.holidayOvertime += entry.overtimeHours;
          }
        } else {
          if (isInsideShiftHours) {
            overtimeHours.weekendInside += entry.overtimeHours;
          } else {
            overtimeHours.workdayOutside += entry.overtimeHours;
          }
        }
      }
    });

    return {
      regularHours,
      overtimeHoursByType: overtimeHours,
      totalOvertimeHours: Object.values(overtimeHours).reduce(
        (sum, hours) => sum + hours,
        0,
      ),
    };
  }

  private calculateRates(employee: User): {
    regularHourlyRate: number;
    overtimeRatesByType: OvertimeRatesByType;
  } {
    const baseHourlyRate = employee.baseSalary
      ? employee.salaryType === 'monthly'
        ? employee.baseSalary / 176 // Standard monthly hours
        : employee.baseSalary
      : 0;

    return {
      regularHourlyRate: baseHourlyRate,
      overtimeRatesByType: {
        workdayOutside:
          this.settings.overtimeRates[employee.employeeType]
            .workdayOutsideShift,
        weekendInside:
          employee.employeeType === EmployeeType.Fulltime
            ? this.settings.overtimeRates[employee.employeeType]
                .weekendInsideShiftFulltime
            : this.settings.overtimeRates[employee.employeeType]
                .weekendInsideShiftParttime,
        weekendOutside:
          this.settings.overtimeRates[employee.employeeType]
            .weekendOutsideShift,
        holidayRegular: 2.0, // Standard holiday rate
        holidayOvertime: 3.0, // Holiday overtime rate
      },
    };
  }

  private calculateOvertimePay(
    hours: OvertimeHoursByType,
    regularHourlyRate: number,
    employeeType: EmployeeType,
  ): {
    overtimePayByType: OvertimePayByType;
    totalOvertimePay: number;
  } {
    const rates = this.settings.overtimeRates[employeeType];

    const overtimePayByType: OvertimePayByType = {
      workdayOutside:
        hours.workdayOutside * regularHourlyRate * rates.workdayOutsideShift,
      weekendInside:
        hours.weekendInside *
        regularHourlyRate *
        (employeeType === EmployeeType.Fulltime
          ? rates.weekendInsideShiftFulltime
          : rates.weekendInsideShiftParttime),
      weekendOutside:
        hours.weekendOutside * regularHourlyRate * rates.weekendOutsideShift,
      holidayRegular: hours.holidayRegular * regularHourlyRate * 2.0,
      holidayOvertime: hours.holidayOvertime * regularHourlyRate * 3.0,
    };

    return {
      overtimePayByType,
      totalOvertimePay: Object.values(overtimePayByType).reduce(
        (sum, pay) => sum + pay,
        0,
      ),
    };
  }

  private calculateBasePay(
    regularHours: number,
    regularHourlyRate: number,
  ): number {
    return regularHours * regularHourlyRate;
  }

  private calculateAttendance(timeEntries: TimeEntry[]): {
    totalLateMinutes: number;
    earlyDepartures: number;
  } {
    return timeEntries.reduce(
      (acc, entry) => ({
        totalLateMinutes: acc.totalLateMinutes + (entry.actualMinutesLate || 0),
        earlyDepartures:
          acc.earlyDepartures +
          (entry.endTime
            ? Math.max(0, entry.actualMinutesLate - entry.regularHours * 60)
            : 0),
      }),
      { totalLateMinutes: 0, earlyDepartures: 0 },
    );
  }

  private calculateLeaves(leaveRequests: LeaveRequest[]) {
    // Mapping of Thai leave types to system leave types
    const leaveTypeMapping: Record<string, string> = {
      ลาป่วย: 'sick',
      ลากิจ: 'business',
      ลาพักร้อน: 'annual',
      ลาไม่รับค่าจ้าง: 'unpaid',
    };

    return leaveRequests.reduce(
      (acc, leave) => {
        // Get the system leave type from the Thai leave type
        const systemLeaveType = leaveTypeMapping[leave.leaveType];

        if (systemLeaveType) {
          const field = `${systemLeaveType}LeaveDays` as keyof typeof acc;
          acc[field] += leave.fullDayCount;
        }

        return acc;
      },
      {
        sickLeaveDays: 0,
        businessLeaveDays: 0,
        annualLeaveDays: 0,
        unpaidLeaveDays: 0,
        holidays: 0,
      },
    );
  }

  private calculateAllowances(employeeType: EmployeeType, workingDays: number) {
    return {
      transportationAllowance: this.settings.allowances.transportation,
      mealAllowance: this.settings.allowances.meal[employeeType] * workingDays,
      housingAllowance: this.settings.allowances.housing,
      totalAllowances:
        this.settings.allowances.transportation +
        this.settings.allowances.meal[employeeType] * workingDays +
        this.settings.allowances.housing,
    };
  }

  private calculateDeductions(
    grossPay: number,
    unpaidLeaveDays: number,
    regularHourlyRate: number,
  ) {
    const socialSecurityBase = Math.min(
      Math.max(grossPay, this.settings.deductions.socialSecurityMinBase),
      this.settings.deductions.socialSecurityMaxBase,
    );

    const socialSecurity =
      socialSecurityBase * this.settings.deductions.socialSecurityRate;
    const tax = this.calculateTax(grossPay);
    const unpaidLeaveDeduction = unpaidLeaveDays * 8 * regularHourlyRate;

    return {
      socialSecurity,
      tax,
      unpaidLeaveDeduction,
      totalDeductions: socialSecurity + tax + unpaidLeaveDeduction,
    };
  }

  private calculateTax(grossPay: number): number {
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

  private async calculateCommission(
    employee: User,
    periodStart: Date,
    periodEnd: Date,
  ) {
    if (employee.role !== 'Sales') return null;

    const commission = await this.prisma.salesCommission.findFirst({
      where: {
        employeeId: employee.employeeId,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
        status: 'calculated',
      },
    });

    return commission
      ? {
          salesAmount: commission.salesAmount,
          commissionRate: commission.commissionRate,
          commissionAmount: commission.commissionAmount,
          quarterlyBonus: commission.quarterlyBonus,
          yearlyBonus: commission.yearlyBonus,
        }
      : null;
  }
}

// services/PayrollService.ts

import { PrismaClient, Prisma } from '@prisma/client';
import {
  startOfDay,
  endOfDay,
  setDate,
  subMonths,
  addMonths,
  differenceInDays,
} from 'date-fns';
import type { PayrollSummaryResponse, PayrollCalculation } from '@/types/api';
import { TimeEntryService } from '@/services/TimeEntryService';
import { HolidayService } from '@/services/HolidayService';

export class PayrollService {
  constructor(
    private prisma: PrismaClient,
    private timeEntryService: TimeEntryService,
    private holidayService: HolidayService,
  ) {}

  async calculatePayroll(
    employeeId: string,
    targetDate: Date,
  ): Promise<PayrollSummaryResponse> {
    const { periodStart, periodEnd } = this.getPayrollPeriod(targetDate);

    // Get cached result if exists
    const cachedResult = await this.prisma.payrollProcessingResult.findFirst({
      where: {
        employeeId,
        periodStart: {
          equals: periodStart,
        },
        periodEnd: {
          equals: periodEnd,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (cachedResult) {
      return this.mapProcessingResultToResponse(cachedResult);
    }

    // Fetch all required data
    const [timeEntries, holidays, leaves, employee, settings] =
      await Promise.all([
        this.timeEntryService.getTimeEntriesForEmployee(
          employeeId,
          periodStart,
          periodEnd,
        ),
        this.holidayService.getHolidays(periodStart, periodEnd),
        this.prisma.leaveRequest.findMany({
          where: {
            employeeId,
            status: 'Approved',
            startDate: {
              lte: periodEnd,
            },
            endDate: {
              gte: periodStart,
            },
          },
        }),
        this.prisma.user.findUnique({
          where: { employeeId },
          include: {
            department: true,
          },
        }),
        this.getPayrollSettings(employeeId),
      ]);

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Calculate work days
    const workDays = this.calculateWorkDays(
      periodStart,
      periodEnd,
      holidays,
      employee.shiftCode,
    );

    // Calculate attendance
    const attendance = this.calculateAttendance(
      timeEntries,
      workDays,
      leaves,
      holidays,
    );

    // Calculate earnings
    const earnings = this.calculateEarnings(
      attendance,
      settings,
      employee.employeeType,
    );

    // Create processing result
    const result = await this.prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        periodStart,
        periodEnd,
        totalWorkingDays: workDays.total,
        totalPresent: attendance.daysPresent,
        totalAbsent: attendance.daysAbsent,
        totalOvertimeHours: attendance.overtimeHours,
        totalRegularHours: attendance.regularHours,
        processedData: JSON.stringify(earnings),
      },
    });

    return this.mapProcessingResultToResponse(result);
  }

  private getPayrollPeriod(date: Date) {
    const isAfter25th = date.getDate() > 25;
    const periodStart = setDate(isAfter25th ? date : subMonths(date, 1), 26);
    const periodEnd = setDate(isAfter25th ? addMonths(date, 1) : date, 25);

    return {
      periodStart: startOfDay(periodStart),
      periodEnd: endOfDay(periodEnd),
    };
  }

  private async getPayrollSettings(employeeId: string) {
    // Fetch from database or use defaults
    return {
      regularHourlyRate: 62.5, // 15000/month for full-time
      overtimeRates: {
        regular: 1.5,
        holiday: 2.0,
      },
      allowances: {
        transportation: 1000,
        meal: 1000,
        housing: 1000,
      },
      deductions: {
        socialSecurity: 0.05, // 5%
        tax: 0, // Calculated based on income
      },
    };
  }

  private calculateWorkDays(
    start: Date,
    end: Date,
    holidays: any[],
    shiftCode: string | null,
  ) {
    const totalDays = differenceInDays(end, start) + 1;
    const holidayDays = holidays.length;
    const weekendDays = this.countWeekendDays(start, end, shiftCode);

    return {
      total: totalDays - holidayDays - weekendDays,
      holidays: holidayDays,
      weekends: weekendDays,
    };
  }

  private calculateAttendance(
    timeEntries: any[],
    workDays: { total: number; holidays: number; weekends: number },
    leaves: any[],
    holidays: any[],
  ) {
    let daysPresent = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    let lateMinutes = 0;

    // Process time entries
    timeEntries.forEach((entry) => {
      if (entry.regularHours > 0) daysPresent++;
      regularHours += entry.regularHours;
      overtimeHours += entry.overtimeHours;
      lateMinutes += entry.actualMinutesLate || 0;
    });

    // Calculate leaves
    const leaveDays = leaves.reduce((total, leave) => {
      const leaveDaysInPeriod = this.calculateLeaveDaysInPeriod(leave);
      return total + leaveDaysInPeriod;
    }, 0);

    return {
      daysPresent,
      daysAbsent: workDays.total - daysPresent - leaveDays,
      regularHours,
      overtimeHours,
      lateMinutes,
      leaveDays,
    };
  }

  private calculateEarnings(
    attendance: any,
    settings: any,
    employeeType: string,
  ) {
    // Calculate base pay
    const basePay = attendance.regularHours * settings.regularHourlyRate;

    // Calculate overtime pay
    const overtimePay =
      attendance.overtimeHours *
      settings.regularHourlyRate *
      settings.overtimeRates.regular;

    // Cast allowances to number[]
    const totalAllowances =
      employeeType === 'Fulltime'
        ? (Object.values(settings.allowances) as number[]).reduce(
            (a: number, b: number) => a + b, // Explicitly tell TypeScript these are numbers
            0,
          )
        : 0;

    // Calculate gross pay
    const grossPay = basePay + overtimePay + totalAllowances;

    // Calculate deductions
    const socialSecurity = Math.min(
      grossPay * settings.deductions.socialSecurity,
      750,
    );
    const tax = this.calculateTax(grossPay);
    const totalDeductions = socialSecurity + tax;

    return {
      basePay,
      overtimePay,
      holidayPay: 0, // Calculate if needed
      allowances: totalAllowances,
      totalDeductions,
      netPayable: grossPay - totalDeductions,
    };
  }

  private calculateTax(grossPay: number): number {
    // Simplified tax calculation
    // Should implement proper tax brackets
    if (grossPay <= 20000) return 0;
    return grossPay * 0.05;
  }

  private calculateLeaveDaysInPeriod(leave: any): number {
    // Implementation depends on your leave day calculation rules
    return leave.fullDayCount || 0;
  }

  private countWeekendDays(
    start: Date,
    end: Date,
    shiftCode: string | null,
  ): number {
    // Implementation depends on your weekend definition
    let count = 0;
    let current = new Date(start);

    while (current <= end) {
      if (current.getDay() === 0) count++; // Sunday
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  private mapProcessingResultToResponse(result: any): PayrollSummaryResponse {
    const processedData = JSON.parse(result.processedData);

    return {
      periodStart: result.periodStart.toISOString(),
      periodEnd: result.periodEnd.toISOString(),
      employeeName: result.user?.name || '',
      departmentName: result.user?.departmentName || '',
      totalWorkDays: result.totalWorkingDays,
      holidays: 0, // Get from holidays count
      regularHours: result.totalRegularHours,
      overtimeHours: result.totalOvertimeHours,
      daysPresent: result.totalPresent,
      daysAbsent: result.totalAbsent,
      leaves: {
        sick: 0, // Calculate from leaves
        business: 0,
        annual: 0,
        unpaid: 0,
      },
      earnings: processedData,
      bankInfo: '', // Add the missing 'bankInfo' property
    };
  }

  async getPayrollPeriods(
    employeeId: string,
  ): Promise<Array<{ start: Date; end: Date }>> {
    // Get last 12 periods
    const periods: Array<{ start: Date; end: Date }> = [];
    let currentDate = new Date();

    for (let i = 0; i < 12; i++) {
      const { periodStart, periodEnd } = this.getPayrollPeriod(currentDate);
      periods.push({
        start: periodStart,
        end: periodEnd,
      });
      currentDate = subMonths(currentDate, 1);
    }

    return periods;
  }
}

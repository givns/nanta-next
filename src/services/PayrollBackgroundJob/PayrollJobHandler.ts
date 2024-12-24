// services/PayrollBackgroundJob/PayrollJobHandler.ts

import { PrismaClient, Prisma, PayrollStatus } from '@prisma/client';
import { PayrollCalculationService } from '../PayrollCalculation/PayrollCalculationService';
import { PayrollUtils } from '@/utils/payrollUtils';
import { parse, startOfMonth, endOfMonth } from 'date-fns';
import { PayrollCalculationResult, PayrollSettingsData } from '@/types/payroll';
import { HolidayService } from '../HolidayService';

const prisma = new PrismaClient();

interface BatchProcessResult {
  success: boolean;
  employeeId: string;
  error?: string;
  result?: PayrollCalculationResult;
}

export class PayrollJobHandler {
  private prisma: PrismaClient;
  private payrollService: PayrollCalculationService | null = null;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize() {
    const settings = await this.prisma.payrollSettings.findFirst();
    if (!settings) {
      throw new Error('Payroll settings not found');
    }

    try {
      const parsedSettings: PayrollSettingsData = {
        overtimeRates: JSON.parse(settings.overtimeRates as string),
        allowances: JSON.parse(settings.allowances as string),
        deductions: JSON.parse(settings.deductions as string),
        rules: JSON.parse(settings.rules as string),
      };

      this.payrollService = new PayrollCalculationService(
        parsedSettings,
        this.prisma,
      );
    } catch (error) {
      throw new Error('Failed to parse payroll settings');
    }
  }

  async processEmployeePayroll(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    sessionId: string,
  ): Promise<BatchProcessResult> {
    try {
      if (!this.payrollService) {
        await this.initialize();
      }

      // Fetch employee data with only required fields
      const employee = await this.prisma.user.findUnique({
        where: { employeeId },
      });

      if (!employee) {
        return {
          success: false,
          employeeId,
          error: `Employee ${employeeId} not found`,
        };
      }

      // Fetch all required data
      const [timeEntries, leaveRequests] = await Promise.all([
        this.prisma.timeEntry.findMany({
          where: {
            employeeId,
            date: { gte: periodStart, lte: periodEnd },
          },
          include: { overtimeMetadata: true },
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            employeeId,
            status: 'approved',
            startDate: { lte: periodEnd },
            endDate: { gte: periodStart },
          },
        }),
      ]);

      if (!this.payrollService) {
        throw new Error('PayrollService not initialized');
      }

      // Calculate payroll
      const result = await this.payrollService.calculatePayroll(
        employee,
        timeEntries,
        leaveRequests,
        periodStart,
        periodEnd,
      );

      // Validate results
      const validation = PayrollUtils.validatePayrollData(result);
      if (!validation.isValid) {
        return {
          success: false,
          employeeId,
          error: `Validation failed: ${validation.errors.join(', ')}`,
        };
      }

      // Create or update payroll period
      const payrollPeriod = await this.prisma.payrollPeriod.upsert({
        where: {
          period_range: {
            startDate: periodStart,
            endDate: periodEnd,
          },
        },
        update: {},
        create: {
          startDate: periodStart,
          endDate: periodEnd,
          status: 'processing',
        },
      });

      // Create or update payroll record
      await this.prisma.payroll.upsert({
        where: {
          employee_period: {
            employeeId,
            payrollPeriodId: payrollPeriod.id,
          },
        },
        create: {
          employeeId,
          payrollPeriodId: payrollPeriod.id,
          regularHours: result.regularHours,
          overtimeHoursByType: JSON.stringify(result.overtimeHoursByType),
          totalOvertimeHours: result.totalOvertimeHours,
          totalWorkingDays: result.totalWorkingDays,
          totalPresent: result.totalPresent,
          totalAbsent: result.totalAbsent,
          totalLateMinutes: result.totalLateMinutes,
          earlyDepartures: result.earlyDepartures,
          sickLeaveDays: result.sickLeaveDays,
          businessLeaveDays: result.businessLeaveDays,
          annualLeaveDays: result.annualLeaveDays,
          unpaidLeaveDays: result.unpaidLeaveDays,
          holidays: result.holidays,
          regularHourlyRate: result.regularHourlyRate,
          overtimeRatesByType: JSON.stringify(result.overtimeRatesByType),
          basePay: result.basePay,
          overtimePayByType: JSON.stringify(result.overtimePayByType),
          totalOvertimePay: result.totalOvertimePay,
          transportationAllowance: result.transportationAllowance,
          mealAllowance: result.mealAllowance,
          housingAllowance: result.housingAllowance,
          totalAllowances: result.totalAllowances,
          socialSecurity: result.socialSecurity,
          tax: result.tax,
          unpaidLeaveDeduction: result.unpaidLeaveDeduction,
          totalDeductions: result.totalDeductions,
          netPayable: result.netPayable,
          status: 'draft' as PayrollStatus,
        },
        update: {
          employeeId,
          payrollPeriodId: payrollPeriod.id,
          regularHours: result.regularHours,
          overtimeHoursByType: JSON.stringify(result.overtimeHoursByType),
          totalOvertimeHours: result.totalOvertimeHours,
          totalWorkingDays: result.totalWorkingDays,
          totalPresent: result.totalPresent,
          totalAbsent: result.totalAbsent,
          totalLateMinutes: result.totalLateMinutes,
          earlyDepartures: result.earlyDepartures,
          sickLeaveDays: result.sickLeaveDays,
          businessLeaveDays: result.businessLeaveDays,
          annualLeaveDays: result.annualLeaveDays,
          unpaidLeaveDays: result.unpaidLeaveDays,
          holidays: result.holidays,
          regularHourlyRate: result.regularHourlyRate,
          overtimeRatesByType: JSON.stringify(result.overtimeRatesByType),
          basePay: result.basePay,
          overtimePayByType: JSON.stringify(result.overtimePayByType),
          totalOvertimePay: result.totalOvertimePay,
          transportationAllowance: result.transportationAllowance,
          mealAllowance: result.mealAllowance,
          housingAllowance: result.housingAllowance,
          totalAllowances: result.totalAllowances,
          socialSecurity: result.socialSecurity,
          tax: result.tax,
          unpaidLeaveDeduction: result.unpaidLeaveDeduction,
          totalDeductions: result.totalDeductions,
          netPayable: result.netPayable,
          status: 'draft' as PayrollStatus,
        },
      });

      // Store processing result
      await this.prisma.payrollProcessingResult.create({
        data: {
          sessionId,
          employeeId,
          periodStart,
          periodEnd,
          processedData: JSON.stringify(result),
          status: 'completed',
        },
      });

      return {
        success: true,
        employeeId,
        result,
      };
    } catch (error) {
      // Log error and create error record in session
      await this.prisma.payrollProcessingResult.create({
        data: {
          sessionId,
          employeeId,
          periodStart,
          periodEnd,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          errorDetails:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: 'Unknown error' },
          processedData: '', // Assign an empty string to the processedData property
        },
      });

      return {
        success: false,
        employeeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async processBatch(sessionId: string, periodYearMonth: string) {
    try {
      if (!this.payrollService) {
        await this.initialize();
      }

      const period = parse(periodYearMonth, 'yyyy-MM', new Date());
      const periodStart = startOfMonth(period);
      const periodEnd = endOfMonth(period);

      // Get all active employees
      const employees = await this.prisma.user.findMany({
        where: {
          employeeType: { not: undefined },
          isRegistrationComplete: 'Yes',
        },
        orderBy: {
          employeeId: 'asc',
        },
      });

      // Update total count
      await this.prisma.payrollProcessingSession.update({
        where: { id: sessionId },
        data: {
          totalEmployees: employees.length,
          processedCount: 0,
        },
      });

      // Process in batches of 10
      const batchSize = 10;
      for (let i = 0; i < employees.length; i += batchSize) {
        const batch = employees.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((employee) =>
            this.processEmployeePayroll(
              employee.employeeId,
              periodStart,
              periodEnd,
              sessionId,
            ),
          ),
        );

        // Update progress
        await this.prisma.payrollProcessingSession.update({
          where: { id: sessionId },
          data: {
            processedCount: Math.min(i + batchSize, employees.length),
          },
        });

        // Log any errors
        results
          .filter((result) => !result.success)
          .forEach((result) => {
            console.error(
              `Error processing employee ${result.employeeId}:`,
              result.error,
            );
          });
      }

      // Mark session as completed
      await this.prisma.payrollProcessingSession.update({
        where: { id: sessionId },
        data: { status: 'completed' },
      });
    } catch (error) {
      console.error('Error in batch processing:', error);
      await this.prisma.payrollProcessingSession.update({
        where: { id: sessionId },
        data: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }
}

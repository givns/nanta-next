// services/PayrollBackgroundJob/PayrollJobHandler.ts
import { PrismaClient, EmployeeType } from '@prisma/client';
import { PayrollCalculationService } from '../PayrollCalculation/PayrollCalculationService';
import { PayrollUtils } from '@/utils/payrollUtils';
import { parse, startOfMonth, endOfMonth } from 'date-fns';
import { PayrollCalculationResult } from '@/types/payroll';

export class PayrollJobHandler {
  private prisma: PrismaClient;
  private payrollService: PayrollCalculationService;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize() {
    const settings = await this.prisma.payrollSettings.findFirst();
    if (!settings) {
      throw new Error('Payroll settings not found');
    }
    this.payrollService = new PayrollCalculationService(
      JSON.parse(settings.overtimeRates as string),
      this.prisma
    );
  }

  async processEmployeePayroll(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    sessionId: string
  ): Promise<PayrollCalculationResult> {
    try {
      // Fetch employee data
      const employee = await this.prisma.user.findUnique({
        where: { employeeId }
      });

      if (!employee) {
        throw new Error(`Employee ${employeeId} not found`);
      }

      // Fetch time entries and leave requests
      const [timeEntries, leaveRequests] = await Promise.all([
        this.prisma.timeEntry.findMany({
          where: {
            employeeId,
            date: { gte: periodStart, lte: periodEnd }
          },
          include: { overtimeMetadata: true }
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            employeeId,
            status: 'approved',
            startDate: { lte: periodEnd },
            endDate: { gte: periodStart }
          }
        })
      ]);

      // Calculate payroll
      const result = await this.payrollService.calculatePayroll(
        employee,
        timeEntries,
        leaveRequests,
        periodStart,
        periodEnd
      );

      // Validate results
      const validation = PayrollUtils.validatePayrollData(result);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Store results
      await this.prisma.payrollProcessingResult.create({
        data: {
          sessionId,
          employeeId,
          periodStart,
          periodEnd,
          processedData: JSON.stringify(result),
          status: 'completed'
        }
      });

      return result;
    } catch (error) {
      // Log error and create error record
      await this.prisma.payrollProcessingError.create({
        data: {
          sessionId,
          employeeId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stackTrace: error instanceof Error ? error.stack : undefined
        }
      });
      throw error;
    }
  }

  async processBatch(sessionId: string, periodYearMonth: string) {
    try {
      await this.initialize();

      const period = parse(periodYearMonth, 'yyyy-MM', new Date());
      const periodStart = startOfMonth(period);
      const periodEnd = endOfMonth(period);

      // Get all active employees
      const employees = await this.prisma.user.findMany({
        where: {
          employeeType: { not: null },
          isRegistrationComplete: 'Yes'
        }
      });

      // Process in batches of 10
      const batchSize = 10;
      for (let i = 0; i < employees.length; i += batchSize) {
        const batch = employees.slice(i, i + batchSize);
        await Promise.all(
          batch.map(employee =>
            this.processEmployeePayroll(
              employee.employeeId,
              periodStart,
              periodEnd,
              sessionId
            ).catch(error => {
              console.error(
                `Error processing employee ${employee.employeeId}:`,
                error
              );
              return null;
            })
          )
        );

        // Update progress
        await this.prisma.payrollProcessingSession.update({
          where: { id: sessionId },
          data: {
            processedCount: Math.min(i + batchSize, employees.length)
          }
        });
      }

      // Mark session as completed
      await this.prisma.payrollProcessingSession.update({
        where: { id: sessionId },
        data: { status: 'completed' }
      });
    } catch (error) {
      console.error('Error in batch processing:', error);
      await this.prisma.payrollProcessingSession.update({
        where: { id: sessionId },
        data: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      throw error;
    }
  }
}
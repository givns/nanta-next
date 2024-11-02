// pages/api/admin/calculate-payroll.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { PayrollCalculationService } from '@/services/PayrollCalculation/PayrollCalculationService';
import { parseISO, isValid } from 'date-fns';
import { PayrollApiResponse, PayrollCalculationResult } from '@/types/payroll';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PayrollApiResponse<PayrollCalculationResult>>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { employeeId, periodStart, periodEnd } = req.body;
    const lineUserId = req.headers['x-line-userid'];

    // Validate input
    if (!employeeId || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
      });
    }

    if (!lineUserId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    // Parse and validate dates
    const startDate = parseISO(periodStart);
    const endDate = parseISO(periodEnd);

    if (!isValid(startDate) || !isValid(endDate)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD',
      });
    }

    // Fetch required data
    const [employee, timeEntries, leaveRequests, settings] = await Promise.all([
      prisma.user.findUnique({
        where: { employeeId },
        select: {
          id: true,
          employeeId: true,
          name: true,
          departmentName: true,
          role: true,
          employeeType: true,
          baseSalary: true,
          salaryType: true,
          bankAccountNumber: true,
        },
      }),
      prisma.timeEntry.findMany({
        where: {
          employeeId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          overtimeMetadata: true,
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId,
          status: 'approved',
          startDate: {
            lte: startDate,
          },
          endDate: {
            gte: endDate,
          },
        },
      }),
      prisma.payrollSettings.findFirst(),
    ]);

    console.log('Data fetch results:', {
      employeeFound: !!employee,
      timeEntriesCount: timeEntries.length,
      leaveRequestsCount: leaveRequests.length,
      settingsFound: !!settings,
    });

    if (!employee || !settings) {
      console.log('Missing data:', {
        employee: !!employee,
        settings: !!settings,
      });
      return res.status(404).json({
        success: false,
        error: `Missing required data: ${!employee ? 'Employee' : 'Settings'} not found`,
      });
    }

    // Initialize service and calculate payroll
    const payrollService = new PayrollCalculationService(
      JSON.parse(settings.overtimeRates as string),
      prisma,
    );

    const result = await payrollService.calculatePayroll(
      {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        lineUserId: null, // Add the missing properties
        nickname: null,
        departmentId: null,
        company: null,
        departmentName: employee.departmentName,
        role: employee.role,
        employeeType: employee.employeeType,
        baseSalary: employee.baseSalary,
        salaryType: employee.salaryType,
        bankAccountNumber: employee.bankAccountNumber,
        updatedAt: null,
        isGovernmentRegistered: '',
        workStartDate: null,
        profilePictureUrl: null,
        shiftId: null,
        shiftCode: null,
        overtimeHours: 0,
        sickLeaveBalance: 0,
        businessLeaveBalance: 0,
        annualLeaveBalance: 0,
        isPreImported: '',
        isRegistrationComplete: '',
      },
      timeEntries,
      leaveRequests,
      parseISO(periodStart),
      parseISO(periodEnd),
    );

    // Create or update payroll period
    const payrollPeriod = await prisma.payrollPeriod.upsert({
      where: {
        period_range: {
          startDate: parseISO(periodStart),
          endDate: parseISO(periodEnd),
        },
      },
      update: {
        status: 'processing',
      },
      create: {
        startDate: parseISO(periodStart),
        endDate: parseISO(periodEnd),
        status: 'processing',
      },
    });

    // Create or update payroll record
    const payroll = await prisma.payroll.upsert({
      where: {
        employee_period: {
          employeeId,
          payrollPeriodId: payrollPeriod.id,
        },
      },
      update: {
        // Hours
        regularHours: result.regularHours,
        overtimeHoursByType: JSON.stringify(result.overtimeHoursByType),
        totalOvertimeHours: result.totalOvertimeHours,

        // Attendance
        totalWorkingDays: result.totalWorkingDays,
        totalPresent: result.totalPresent,
        totalAbsent: result.totalAbsent,
        totalLateMinutes: result.totalLateMinutes,
        earlyDepartures: result.earlyDepartures,

        // Leaves
        sickLeaveDays: result.sickLeaveDays,
        businessLeaveDays: result.businessLeaveDays,
        annualLeaveDays: result.annualLeaveDays,
        unpaidLeaveDays: result.unpaidLeaveDays,
        holidays: result.holidays,

        // Rates
        regularHourlyRate: result.regularHourlyRate,
        overtimeRatesByType: JSON.stringify(result.overtimeRatesByType),

        // Calculations
        basePay: result.basePay,
        overtimePayByType: JSON.stringify(result.overtimePayByType),
        totalOvertimePay: result.totalOvertimePay,

        // Allowances
        transportationAllowance: result.transportationAllowance,
        mealAllowance: result.mealAllowance,
        housingAllowance: result.housingAllowance,
        totalAllowances: Object.values(result.totalAllowances).reduce(
          (sum, val) => sum + val,
          0,
        ),

        // Deductions
        socialSecurity: result.socialSecurity,
        tax: result.tax,
        unpaidLeaveDeduction: result.unpaidLeaveDeduction,
        totalDeductions: result.totalDeductions,

        // Commission (if exists)
        salesAmount: result.salesAmount,
        commissionRate: result.commissionRate,
        commissionAmount: result.commissionAmount,
        quarterlyBonus: result.quarterlyBonus,
        yearlyBonus: result.yearlyBonus,

        netPayable: result.netPayable,
        status: 'draft',
      },
      create: {
        employeeId,
        payrollPeriodId: payrollPeriod.id,
        // All the same fields as update
        regularHours: result.regularHours,
        overtimeHoursByType: JSON.stringify(result.overtimeHoursByType),
        totalOvertimeHours: result.totalOvertimeHours,
        totalWorkingDays: result.totalWorkingDays,
        totalPresent: result.totalPresent,
        totalAbsent: result.totalAbsent,
        totalLateMinutes: result.totalLateMinutes,
        earlyDepartures: result.earlyDepartures,

        // Leaves
        sickLeaveDays: result.sickLeaveDays,
        businessLeaveDays: result.businessLeaveDays,
        annualLeaveDays: result.annualLeaveDays,
        unpaidLeaveDays: result.unpaidLeaveDays,
        holidays: result.holidays,

        // Rates
        regularHourlyRate: result.regularHourlyRate,
        overtimeRatesByType: JSON.stringify(result.overtimeRatesByType),

        // Calculations
        basePay: result.basePay,
        overtimePayByType: JSON.stringify(result.overtimePayByType),
        totalOvertimePay: result.totalOvertimePay,

        // Allowances
        transportationAllowance: result.transportationAllowance,
        mealAllowance: result.mealAllowance,
        housingAllowance: result.housingAllowance,
        totalAllowances: Object.values(result.totalAllowances).reduce(
          (sum, val) => sum + val,
          0,
        ),

        // Deductions
        socialSecurity: result.socialSecurity,
        tax: result.tax,
        unpaidLeaveDeduction: result.unpaidLeaveDeduction,
        totalDeductions: result.totalDeductions,

        // Commission (if exists)
        salesAmount: result.salesAmount,
        commissionRate: result.commissionRate,
        commissionAmount: result.commissionAmount,
        quarterlyBonus: result.quarterlyBonus,
        yearlyBonus: result.yearlyBonus,

        netPayable: result.netPayable,
        status: 'draft',
      },
    });

    // Store processing result
    await prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        sessionId: '', // You might want to handle session ID differently
        periodStart: parseISO(periodStart),
        periodEnd: parseISO(periodEnd),
        processedData: JSON.stringify(result),
        status: 'completed',
      },
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error calculating payroll:', error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Error calculating payroll',
    });
  }
}

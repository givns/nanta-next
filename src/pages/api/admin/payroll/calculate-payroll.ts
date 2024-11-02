// pages/api/admin/calculate-payroll.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { EmployeeType, Prisma, PrismaClient } from '@prisma/client';
import { PayrollCalculationService } from '@/services/PayrollCalculation/PayrollCalculationService';
import { parseISO, isValid, format } from 'date-fns';
import {
  PayrollApiResponse,
  PayrollCalculationResult,
  PayrollSettingsData,
} from '@/types/payroll';
import { HolidayService } from '@/services/HolidayService';

const prisma = new PrismaClient();

// Add type for MongoDB settings document
type MongoSettingsDoc = {
  overtimeRates: Prisma.JsonValue;
  allowances: Prisma.JsonValue;
  deductions: Prisma.JsonValue;
  rules: Prisma.JsonValue;
};

// Helper to safely access nested JSON values
function safeGet<T>(
  obj: Prisma.JsonValue | null | undefined,
  path: string[],
  defaultValue: T,
): T {
  try {
    let current = obj;
    for (const key of path) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as any)[key];
      } else {
        return defaultValue;
      }
    }
    return (current as T) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

// Convert settings document to PayrollSettingsData
function convertSettings(settingsDoc: MongoSettingsDoc): PayrollSettingsData {
  const defaultRates = {
    workdayOutsideShift: 1.5,
    weekendInsideShiftFulltime: 1.0,
    weekendInsideShiftParttime: 2.0,
    weekendOutsideShift: 3.0,
  };

  return {
    overtimeRates: {
      [EmployeeType.Fulltime]: safeGet(
        settingsDoc.overtimeRates,
        ['Fulltime'],
        defaultRates,
      ),
      [EmployeeType.Parttime]: safeGet(
        settingsDoc.overtimeRates,
        ['Parttime'],
        defaultRates,
      ),
      [EmployeeType.Probation]: safeGet(
        settingsDoc.overtimeRates,
        ['Probation'],
        defaultRates,
      ),
    },
    allowances: {
      transportation: safeGet(settingsDoc.allowances, ['transportation'], 0),
      meal: {
        [EmployeeType.Fulltime]: safeGet(
          settingsDoc.allowances,
          ['meal', 'Fulltime'],
          0,
        ),
        [EmployeeType.Parttime]: safeGet(
          settingsDoc.allowances,
          ['meal', 'Parttime'],
          30,
        ),
        [EmployeeType.Probation]: safeGet(
          settingsDoc.allowances,
          ['meal', 'Probation'],
          0,
        ),
      },
      housing: safeGet(settingsDoc.allowances, ['housing'], 0),
    },
    deductions: {
      socialSecurityRate: safeGet(
        settingsDoc.deductions,
        ['socialSecurityRate'],
        0.05,
      ),
      socialSecurityMinBase: safeGet(
        settingsDoc.deductions,
        ['socialSecurityMinBase'],
        1650,
      ),
      socialSecurityMaxBase: safeGet(
        settingsDoc.deductions,
        ['socialSecurityMaxBase'],
        15000,
      ),
    },
    rules: {
      payrollPeriodStart: safeGet(
        settingsDoc.rules,
        ['payrollPeriodStart'],
        26,
      ),
      payrollPeriodEnd: safeGet(settingsDoc.rules, ['payrollPeriodEnd'], 25),
      overtimeMinimumMinutes: safeGet(
        settingsDoc.rules,
        ['overtimeMinimumMinutes'],
        30,
      ),
      roundOvertimeTo: safeGet(settingsDoc.rules, ['roundOvertimeTo'], 30),
    },
  };
}

// Move this function up with other helper functions, before the handler
async function createOrGetProcessingSession(
  prisma: PrismaClient,
  periodStart: Date,
  employeeId: string,
): Promise<string> {
  const periodYearMonth = format(periodStart, 'yyyy-MM');

  // Try to find existing session for this period
  let session = await prisma.payrollProcessingSession.findFirst({
    where: {
      periodYearMonth,
      status: 'processing',
    },
  });

  // If no session exists, create one
  if (!session) {
    session = await prisma.payrollProcessingSession.create({
      data: {
        periodYearMonth,
        status: 'processing',
        totalEmployees: 1,
        processedCount: 0,
      },
    });
  }

  return session.id;
}

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
    const [employee, timeEntries, leaveRequests, rawSettings] =
      await Promise.all([
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
            shiftCode: true,
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
              lte: endDate,
            },
            endDate: {
              gte: startDate,
            },
          },
        }),
        prisma.payrollSettings.findFirst(),
      ]);

    console.log('Data fetch results:', {
      employeeFound: !!employee,
      timeEntriesCount: timeEntries.length,
      leaveRequestsCount: leaveRequests.length,
      settingsFound: !!rawSettings,
    });

    console.log('Employee data:', {
      type: employee?.employeeType,
      rawSettings: rawSettings,
    });

    // Add validation for shiftCode
    if (!employee?.shiftCode) {
      return res.status(400).json({
        success: false,
        error:
          'Employee shift code not found. Please assign a shift to the employee.',
      });
    }

    if (!employee || !rawSettings) {
      return res.status(404).json({
        success: false,
        error: `Missing required data: ${!employee ? 'Employee' : 'Settings'} not found`,
      });
    }

    // Convert MongoDB document to typed settings
    const settings = convertSettings(rawSettings as MongoSettingsDoc);

    console.log('Debug:', {
      employeeType: employee.employeeType,
      hasSettings: !!settings,
      hasOvertimeRates: !!settings.overtimeRates[employee.employeeType],
    });

    // Verify required settings exist
    if (!settings.overtimeRates[employee.employeeType]) {
      return res.status(500).json({
        success: false,
        error: `Missing overtime rates for employee type: ${employee.employeeType}`,
      });
    }

    const holidayService = new HolidayService(prisma);

    // Initialize service with full settings object
    const payrollService = new PayrollCalculationService(
      settings,
      prisma,
      holidayService,
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
        shiftCode: employee.shiftCode, // Ensure this is passed
        overtimeHours: 0,
        sickLeaveBalance: 0,
        businessLeaveBalance: 0,
        annualLeaveBalance: 0,
        isPreImported: '',
        isRegistrationComplete: '',
      },
      timeEntries,
      leaveRequests,
      startDate,
      endDate,
    );

    // Create or update payroll period
    const payrollPeriod = await prisma.payrollPeriod.upsert({
      where: {
        period_range: {
          startDate,
          endDate,
        },
      },
      update: {
        status: 'processing',
      },
      create: {
        startDate,
        endDate,
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
        overtimeHoursByType: result.overtimeHoursByType as any,
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
        overtimeRatesByType: result.overtimeRatesByType as any,

        // Calculations
        basePay: result.basePay,
        overtimePayByType: result.overtimePayByType as any,
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
        overtimeHoursByType: result.overtimeHoursByType as any,
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
        overtimeRatesByType: result.overtimeRatesByType as any,

        // Calculations
        basePay: result.basePay,
        overtimePayByType: result.overtimePayByType as any,
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

    // Get or create processing session
    const sessionId = await createOrGetProcessingSession(
      prisma,
      startDate,
      employeeId,
    );

    // Store processing result with valid session ID
    await prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        sessionId, // Now using valid MongoDB ObjectId
        periodStart: startDate,
        periodEnd: endDate,
        processedData: JSON.stringify(result),
        status: 'completed',
      },
    });

    // Update session processed count
    await prisma.payrollProcessingSession.update({
      where: { id: sessionId },
      data: {
        processedCount: {
          increment: 1,
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error calculating payroll:', error);

    // Try to log error to processing result if we have a sessionId
    const sessionId = req.body.sessionId;
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
    if (sessionId && startDate && endDate) {
      try {
        await prisma.payrollProcessingResult.create({
          data: {
            employeeId: req.body.employeeId,
            sessionId,
            periodStart: startDate,
            periodEnd: endDate,
            processedData: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch (logError) {
        console.error('Failed to log processing error:', logError);
      }
    }

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Error calculating payroll',
    });
  }
}

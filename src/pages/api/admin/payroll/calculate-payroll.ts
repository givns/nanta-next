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
import { LeaveRequest } from '../../../../types/attendance';

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

function convertSettings(
  settingsDoc: MongoSettingsDoc | null,
): PayrollSettingsData {
  if (!settingsDoc) {
    console.error('Settings document is null');
    throw new Error('Payroll settings not found');
  }

  try {
    console.log('Raw settings document:', settingsDoc);

    // Default rates if settings are missing
    const defaultRates = {
      workdayOutsideShift: 1.5,
      weekendInsideShiftFulltime: 1.0,
      weekendInsideShiftParttime: 2.0,
      weekendOutsideShift: 3.0,
    };

    // Validate overtime rates
    const overtimeRates = {
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
    };

    console.log('Parsed overtime rates:', overtimeRates);

    const settings: PayrollSettingsData = {
      overtimeRates,
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

    console.log('Final parsed settings:', settings);
    return settings;
  } catch (error) {
    console.error('Error parsing settings:', error);
    console.error('Settings document that failed:', settingsDoc);
    throw new Error(
      `Failed to parse payroll settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

// Modify the createOrGetProcessingSession to accept transaction client
async function createOrGetProcessingSession(
  periodStart: Date,
  employeeId: string,
): Promise<string> {
  const periodYearMonth = format(periodStart, 'yyyy-MM');

  let session = await prisma.payrollProcessingSession.findFirst({
    where: {
      periodYearMonth,
      status: 'processing',
    },
  });

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

    // Input validation
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
            status: 'Approved',
            AND: [
              { startDate: { lte: endDate } },
              { endDate: { gte: startDate } },
            ],
          },
        }),
        prisma.payrollSettings.findFirst(),
      ]);

    // Validate data
    if (!employee?.shiftCode) {
      throw new Error(
        'Employee shift code not found. Please assign a shift to the employee.',
      );
    }

    if (!employee || !rawSettings) {
      throw new Error(
        `Missing required data: ${!employee ? 'Employee' : 'Settings'} not found`,
      );
    }

    // Convert settings
    const settings = convertSettings(rawSettings);

    // Initialize services
    const payrollService = new PayrollCalculationService(settings, prisma);

    // Map leave requests
    const mappedLeaveRequests = leaveRequests.map((leave) => ({
      ...leave,
      startDate: new Date(leave.startDate),
      endDate: new Date(leave.endDate),
      createdAt: new Date(),
      updatedAt: new Date(),
      approverId: null,
      denierId: null,
      denialReason: null,
      resubmitted: false,
      originalRequestId: null,
    })) as LeaveRequest[];

    // Calculate payroll
    const calculationResult = await payrollService.calculatePayroll(
      {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        lineUserId: null,
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
        shiftCode: employee.shiftCode,
        overtimeHours: 0,
        sickLeaveBalance: 0,
        businessLeaveBalance: 0,
        annualLeaveBalance: 0,
        isPreImported: '',
        isRegistrationComplete: '',
      },
      timeEntries,
      mappedLeaveRequests,
      startDate,
      endDate,
    );

    // Create/Update payroll period
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

    // Create/Update payroll record
    if (calculationResult && calculationResult.netPayable !== undefined) {
      await prisma.payroll.upsert({
        where: {
          employee_period: {
            employeeId,
            payrollPeriodId: payrollPeriod.id,
          },
        },
        create: {
          employeeId,
          payrollPeriodId: payrollPeriod.id,
          regularHours: calculationResult.regularHours || 0,
          overtimeHoursByType: calculationResult.overtimeHoursByType as any,
          totalOvertimeHours: calculationResult.totalOvertimeHours || 0,
          totalWorkingDays: calculationResult.totalWorkingDays || 0,
          totalPresent: calculationResult.totalPresent || 0,
          totalAbsent: calculationResult.totalAbsent || 0,
          totalLateMinutes: calculationResult.totalLateMinutes || 0,
          earlyDepartures: calculationResult.earlyDepartures || 0,
          sickLeaveDays: calculationResult.sickLeaveDays || 0,
          businessLeaveDays: calculationResult.businessLeaveDays || 0,
          annualLeaveDays: calculationResult.annualLeaveDays || 0,
          unpaidLeaveDays: calculationResult.unpaidLeaveDays || 0,
          holidays: calculationResult.holidays || 0,
          regularHourlyRate: calculationResult.regularHourlyRate || 0,
          overtimeRatesByType: calculationResult.overtimeRatesByType as any,
          basePay: calculationResult.basePay || 0,
          overtimePayByType: calculationResult.overtimePayByType as any,
          totalOvertimePay: calculationResult.totalOvertimePay || 0,
          transportationAllowance:
            calculationResult.transportationAllowance || 0,
          mealAllowance: calculationResult.mealAllowance || 0,
          housingAllowance: calculationResult.housingAllowance || 0,
          totalAllowances: Object.values(
            calculationResult.totalAllowances || {},
          ).reduce((sum, val) => sum + (val || 0), 0),
          socialSecurity: calculationResult.socialSecurity || 0,
          tax: calculationResult.tax || 0,
          unpaidLeaveDeduction: calculationResult.unpaidLeaveDeduction || 0,
          totalDeductions: calculationResult.totalDeductions || 0,
          salesAmount: calculationResult.salesAmount || 0,
          commissionRate: calculationResult.commissionRate || 0,
          commissionAmount: calculationResult.commissionAmount || 0,
          quarterlyBonus: calculationResult.quarterlyBonus || 0,
          yearlyBonus: calculationResult.yearlyBonus || 0,
          netPayable: calculationResult.netPayable || 0,
          status: 'draft',
        },
        update: {
          regularHours: calculationResult.regularHours || 0,
          overtimeHoursByType: calculationResult.overtimeHoursByType as any,
          totalOvertimeHours: calculationResult.totalOvertimeHours || 0,
          totalWorkingDays: calculationResult.totalWorkingDays || 0,
          totalPresent: calculationResult.totalPresent || 0,
          totalAbsent: calculationResult.totalAbsent || 0,
          totalLateMinutes: calculationResult.totalLateMinutes || 0,
          earlyDepartures: calculationResult.earlyDepartures || 0,
          sickLeaveDays: calculationResult.sickLeaveDays || 0,
          businessLeaveDays: calculationResult.businessLeaveDays || 0,
          annualLeaveDays: calculationResult.annualLeaveDays || 0,
          unpaidLeaveDays: calculationResult.unpaidLeaveDays || 0,
          holidays: calculationResult.holidays || 0,
          regularHourlyRate: calculationResult.regularHourlyRate || 0,
          overtimeRatesByType: calculationResult.overtimeRatesByType as any,
          basePay: calculationResult.basePay || 0,
          overtimePayByType: calculationResult.overtimePayByType as any,
          totalOvertimePay: calculationResult.totalOvertimePay || 0,
          transportationAllowance:
            calculationResult.transportationAllowance || 0,
          mealAllowance: calculationResult.mealAllowance || 0,
          housingAllowance: calculationResult.housingAllowance || 0,
          totalAllowances: Object.values(
            calculationResult.totalAllowances || {},
          ).reduce((sum, val) => sum + (val || 0), 0),
          socialSecurity: calculationResult.socialSecurity || 0,
          tax: calculationResult.tax || 0,
          unpaidLeaveDeduction: calculationResult.unpaidLeaveDeduction || 0,
          totalDeductions: calculationResult.totalDeductions || 0,
          salesAmount: calculationResult.salesAmount || 0,
          commissionRate: calculationResult.commissionRate || 0,
          commissionAmount: calculationResult.commissionAmount || 0,
          quarterlyBonus: calculationResult.quarterlyBonus || 0,
          yearlyBonus: calculationResult.yearlyBonus || 0,
          netPayable: calculationResult.netPayable || 0,
          status: 'draft',
        },
      });
    }

    // Create processing session and result
    const sessionId = await createOrGetProcessingSession(startDate, employeeId);
    await prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        sessionId,
        periodStart: startDate,
        periodEnd: endDate,
        processedData: JSON.stringify(calculationResult),
        status: 'completed',
      },
    });

    // Update session count
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
      data: calculationResult,
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

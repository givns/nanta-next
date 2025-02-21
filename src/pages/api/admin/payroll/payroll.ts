// pages/api/admin/payroll/payroll.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma, PayrollStatus } from '@prisma/client';
import {
  PayrollCalculationResult,
  PayrollApiResponse,
  OvertimeRatesByType,
  OvertimeHoursByType,
  OvertimePayByType,
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@/types/payroll';
import { z } from 'zod';
import { isValid, parseISO } from 'date-fns';

const prisma = new PrismaClient();

const DEFAULT_OVERTIME_RATES: OvertimeRatesByType = {
  workdayOutside: 0,
  weekendInside: 0,
  weekendOutside: 0,
  holidayRegular: 0,
  holidayOvertime: 0,
};

const DEFAULT_OVERTIME_HOURS: OvertimeHoursByType = {
  workdayOutside: 0,
  weekendInside: 0,
  weekendOutside: 0,
  holidayRegular: 0,
  holidayOvertime: 0,
};

const DEFAULT_OVERTIME_PAY: OvertimePayByType = {
  workdayOutside: 0,
  weekendInside: 0,
  weekendOutside: 0,
  holidayRegular: 0,
  holidayOvertime: 0,
};

// Validation schemas
const payrollInputSchema = z.object({
  employeeId: z.string(),
  periodStart: z.preprocess((arg) => {
    if (typeof arg === 'string' || arg instanceof Date) {
      return new Date(arg);
    }
  }, z.date()),
  periodEnd: z.preprocess((arg) => {
    if (typeof arg === 'string' || arg instanceof Date) {
      return new Date(arg);
    }
  }, z.date()),
  payrollData: z.object({
    regularHours: z.number(),
    overtimeHoursByType: z.record(z.string(), z.number()),
    totalOvertimeHours: z.number(),
    totalWorkingDays: z.number(),
    totalPresent: z.number(),
    totalAbsent: z.number(),
    totalLateMinutes: z.number(),
    earlyDepartures: z.number(),
    sickLeaveDays: z.number(),
    businessLeaveDays: z.number(),
    annualLeaveDays: z.number(),
    unpaidLeaveDays: z.number(),
    holidays: z.number(),
    regularHourlyRate: z.number(),
    overtimeRatesByType: z.record(z.string(), z.number()),
    basePay: z.number(),
    overtimePayByType: z.record(z.string(), z.number()),
    totalOvertimePay: z.number(),
    transportationAllowance: z.number(),
    mealAllowance: z.number(),
    housingAllowance: z.number(),
    totalAllowances: z.number(),
    socialSecurity: z.number(),
    tax: z.number(),
    unpaidLeaveDeduction: z.number(),
    totalDeductions: z.number(),
    netPayable: z.number(),
    status: z.enum(['draft', 'processing', 'completed', 'approved', 'paid']),
  }),
});

// Add this helper function
function safeParseJSON<T>(
  jsonString: string | null | undefined,
  defaultValue: T,
): T {
  if (!jsonString) return defaultValue;
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return defaultValue;
  }
}

async function handleGetPayroll(
  req: NextApiRequest,
  res: NextApiResponse<PayrollApiResponse<PayrollCalculationResult | null>>,
) {
  const { employeeId, periodStart, periodEnd } = req.query;

  if (!employeeId || !periodStart || !periodEnd) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: 'Missing required parameters',
    };
    return res.status(400).json(errorResponse);
  }

  try {
    // Parse and validate dates
    const startDate = parseISO(periodStart as string);
    const endDate = parseISO(periodEnd as string);

    if (!isValid(startDate) || !isValid(endDate)) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD',
      };
      return res.status(400).json(errorResponse);
    }

    const existingPayroll = await prisma.payroll.findFirst({
      where: {
        employeeId: employeeId as string,
        payrollPeriod: {
          startDate,
          endDate,
        },
      },
      include: {
        user: true,
        payrollPeriod: true,
      },
    });

    const successResponse: ApiSuccessResponse<PayrollCalculationResult | null> =
      {
        success: true,
        data: existingPayroll ? formatPayrollResponse(existingPayroll) : null,
        meta: {
          exists: !!existingPayroll,
          message: existingPayroll
            ? 'Payroll record found'
            : 'No existing payroll record for this period',
        } as Record<string, unknown>, // Add index signature for type 'string'
      };

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error('Error in handleGetPayroll:', error);
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: 'Failed to fetch payroll record',
    };
    return res.status(500).json(errorResponse);
  }
}

async function handleCreatePayroll(
  req: NextApiRequest,
  res: NextApiResponse<PayrollApiResponse<PayrollCalculationResult>>,
) {
  try {
    const validatedData = payrollInputSchema.parse(req.body);
    const { employeeId, periodStart, periodEnd, payrollData } = validatedData;

    // Begin transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create or get payroll period
      const payrollPeriod = await tx.payrollPeriod.upsert({
        where: {
          period_range: {
            startDate: new Date(periodStart),
            endDate: new Date(periodEnd),
          },
        },
        update: {},
        create: {
          startDate: new Date(periodStart),
          endDate: new Date(periodEnd),
          status: 'draft',
        },
      });

      // Create payroll record
      const payroll = await tx.payroll.create({
        data: {
          employeeId,
          payrollPeriodId: payrollPeriod.id,
          regularHours: payrollData.regularHours,
          overtimeHoursByType: JSON.stringify(payrollData.overtimeHoursByType),
          totalOvertimeHours: payrollData.totalOvertimeHours,
          totalWorkingDays: payrollData.totalWorkingDays,
          totalPresent: payrollData.totalPresent,
          totalAbsent: payrollData.totalAbsent,
          totalLateMinutes: payrollData.totalLateMinutes,
          earlyDepartures: payrollData.earlyDepartures,
          sickLeaveDays: payrollData.sickLeaveDays,
          businessLeaveDays: payrollData.businessLeaveDays,
          annualLeaveDays: payrollData.annualLeaveDays,
          unpaidLeaveDays: payrollData.unpaidLeaveDays,
          holidays: payrollData.holidays,
          regularHourlyRate: payrollData.regularHourlyRate,
          overtimeRatesByType: JSON.stringify(payrollData.overtimeRatesByType),
          basePay: payrollData.basePay,
          overtimePayByType: JSON.stringify(payrollData.overtimePayByType),
          totalOvertimePay: payrollData.totalOvertimePay,
          transportationAllowance: payrollData.transportationAllowance,
          mealAllowance: payrollData.mealAllowance,
          housingAllowance: payrollData.housingAllowance,
          totalAllowances: payrollData.totalAllowances,
          socialSecurity: payrollData.socialSecurity,
          tax: payrollData.tax,
          unpaidLeaveDeduction: payrollData.unpaidLeaveDeduction,
          totalDeductions: payrollData.totalDeductions,
          netPayable: payrollData.netPayable,
          status: payrollData.status as PayrollStatus,
        },
        include: {
          user: true,
          payrollPeriod: true,
        },
      });

      return payroll;
    });

    const successResponse: ApiSuccessResponse<PayrollCalculationResult> = {
      success: true,
      data: formatPayrollResponse(result),
    };

    return res.status(201).json(successResponse);
  } catch (error) {
    console.error('Error in handleCreatePayroll:', error);
    const errorResponse: ApiErrorResponse = {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create payroll record',
      meta:
        error instanceof Prisma.PrismaClientKnownRequestError
          ? { code: error.code }
          : undefined,
    };
    return res.status(500).json(errorResponse);
  }
}

async function handleUpdatePayroll(
  req: NextApiRequest,
  res: NextApiResponse<PayrollApiResponse<PayrollCalculationResult>>,
) {
  try {
    const validatedData = payrollInputSchema.parse(req.body);
    const { employeeId, periodStart, periodEnd, payrollData } = validatedData;

    const payrollPeriod = await prisma.payrollPeriod.findFirst({
      where: {
        startDate: new Date(periodStart),
        endDate: new Date(periodEnd),
      },
    });

    if (!payrollPeriod) {
      return res.status(404).json({
        success: false,
        error: 'Payroll period not found',
      });
    }

    const updatedPayroll = await prisma.payroll.update({
      where: {
        employee_period: {
          employeeId,
          payrollPeriodId: payrollPeriod.id,
        },
      },
      data: {
        regularHours: payrollData.regularHours,
        overtimeHoursByType: JSON.stringify(payrollData.overtimeHoursByType),
        totalOvertimeHours: payrollData.totalOvertimeHours,
        totalWorkingDays: payrollData.totalWorkingDays,
        totalPresent: payrollData.totalPresent,
        totalAbsent: payrollData.totalAbsent,
        totalLateMinutes: payrollData.totalLateMinutes,
        earlyDepartures: payrollData.earlyDepartures,
        sickLeaveDays: payrollData.sickLeaveDays,
        businessLeaveDays: payrollData.businessLeaveDays,
        annualLeaveDays: payrollData.annualLeaveDays,
        unpaidLeaveDays: payrollData.unpaidLeaveDays,
        holidays: payrollData.holidays,
        regularHourlyRate: payrollData.regularHourlyRate,
        overtimeRatesByType: JSON.stringify(payrollData.overtimeRatesByType),
        basePay: payrollData.basePay,
        overtimePayByType: JSON.stringify(payrollData.overtimePayByType),
        totalOvertimePay: payrollData.totalOvertimePay,
        transportationAllowance: payrollData.transportationAllowance,
        mealAllowance: payrollData.mealAllowance,
        housingAllowance: payrollData.housingAllowance,
        totalAllowances: payrollData.totalAllowances,
        socialSecurity: payrollData.socialSecurity,
        tax: payrollData.tax,
        unpaidLeaveDeduction: payrollData.unpaidLeaveDeduction,
        totalDeductions: payrollData.totalDeductions,
        netPayable: payrollData.netPayable,
        status: payrollData.status as PayrollStatus,
      },
      include: {
        user: true,
        payrollPeriod: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: formatPayrollResponse(updatedPayroll),
    });
  } catch (error) {
    console.error('Error in handleUpdatePayroll:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return res.status(400).json({
        success: false,
        error: 'Database error',
        meta: { code: error.code },
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to update payroll record',
    });
  }
}

function formatPayrollResponse(payroll: any): PayrollCalculationResult {
  return {
    employee: {
      id: payroll.user.id,
      employeeId: payroll.user.employeeId,
      name: payroll.user.name,
      departmentName: payroll.user.departmentName,
      role: payroll.user.role,
      employeeType: payroll.user.employeeType,
    },
    regularHours: payroll.regularHours,
    overtimeHoursByType: safeParseJSON(
      payroll.overtimeHoursByType,
      DEFAULT_OVERTIME_HOURS,
    ),
    totalOvertimeHours: payroll.totalOvertimeHours,
    totalWorkingDays: payroll.totalWorkingDays,
    totalPresent: payroll.totalPresent,
    totalAbsent: payroll.totalAbsent,
    totalLateMinutes: payroll.totalLateMinutes,
    earlyDepartures: payroll.earlyDepartures,
    sickLeaveDays: payroll.sickLeaveDays,
    businessLeaveDays: payroll.businessLeaveDays,
    annualLeaveDays: payroll.annualLeaveDays,
    unpaidLeaveDays: payroll.unpaidLeaveDays,
    holidays: payroll.holidays,
    regularHourlyRate: payroll.regularHourlyRate,
    overtimeRatesByType: safeParseJSON(
      payroll.overtimeRatesByType,
      DEFAULT_OVERTIME_RATES,
    ),
    basePay: payroll.basePay,
    overtimePayByType: safeParseJSON(
      payroll.overtimePayByType,
      DEFAULT_OVERTIME_PAY,
    ),
    totalOvertimePay: payroll.totalOvertimePay,
    transportationAllowance: payroll.transportationAllowance,
    mealAllowance: payroll.mealAllowance,
    housingAllowance: payroll.housingAllowance,
    totalAllowances: payroll.totalAllowances,
    socialSecurity: payroll.socialSecurity,
    tax: payroll.tax,
    unpaidLeaveDeduction: payroll.unpaidLeaveDeduction,
    totalDeductions: payroll.totalDeductions,
    netPayable: payroll.netPayable,
    status: payroll.status,
  };
}

async function handleMethodNotAllowed(
  req: NextApiRequest,
): Promise<ApiErrorResponse> {
  return {
    success: false,
    error: `Method ${req.method} Not Allowed`,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PayrollApiResponse<PayrollCalculationResult | null>>,
) {
  const lineUserId = req.headers['x-line-userid'];
  if (!lineUserId) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: 'Unauthorized',
    };
    return res.status(401).json(errorResponse);
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGetPayroll(req, res);
      case 'POST':
        return await handleCreatePayroll(req, res);
      case 'PUT':
        return await handleUpdatePayroll(req, res);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT']);
        return res.status(405).json(await handleMethodNotAllowed(req));
    }
  } catch (error) {
    console.error('Error in payroll handler:', error);

    const meta =
      error instanceof z.ZodError ? { details: error.errors } : undefined;
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      meta,
    };
    return res.status(500).json(errorResponse);
  }
}

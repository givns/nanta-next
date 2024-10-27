// pages/api/admin/payroll.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { PayrollCalculationService } from '@/services/PayrollCalculation/PayrollCalculationService';
import { ProbationAdjustmentService } from '@/services/PayrollCalculation/ProbationAdjustmentService';
import { AdminPayrollData, PayrollStatus } from '@/types/payroll';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  switch (req.method) {
    case 'GET':
      return handleGetPayroll(req, res);
    case 'POST':
      return handleCreatePayroll(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

async function handleGetPayroll(
  req: NextApiRequest,
  res: NextApiResponse<AdminPayrollData | { error: string }>,
) {
  try {
    const { employeeId, periodStart, periodEnd } = req.query;

    if (
      !employeeId ||
      !periodStart ||
      !periodEnd ||
      typeof employeeId !== 'string' ||
      typeof periodStart !== 'string' ||
      typeof periodEnd !== 'string'
    ) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Get existing payroll record
    const existingPayroll = await prisma.payroll.findFirst({
      where: {
        employeeId,
        payrollPeriod: {
          startDate: new Date(periodStart),
          endDate: new Date(periodEnd),
        },
      },
      include: {
        user: true,
        payrollPeriod: true,
      },
    });

    if (existingPayroll) {
      return res.status(200).json(formatPayrollResponse(existingPayroll));
    }

    // If no existing payroll, return empty template
    const employee = await prisma.user.findUnique({
      where: { employeeId },
      select: {
        id: true,
        employeeId: true,
        name: true,
        departmentName: true,
        role: true,
        bankAccountNumber: true,
      },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emptyPayrollData: AdminPayrollData = {
      employee: {
        id: employee.id,
        name: employee.name,
        employeeId: employee.employeeId,
        departmentName: employee.departmentName,
        role: employee.role,
        bankInfo: employee.bankAccountNumber
          ? {
              bankName: 'Bank Name', // Add bank name field to User model if needed
              accountNumber: employee.bankAccountNumber,
            }
          : undefined,
      },
      summary: {
        totalWorkingDays: 0,
        totalPresent: 0,
        totalAbsent: 0,
        periodStart,
        periodEnd,
      },
      hours: {
        regularHours: 0,
        overtimeHours: 0,
        holidayHours: 0,
        holidayOvertimeHours: 0,
      },
      attendance: {
        totalLateMinutes: 0,
        earlyDepartures: 0,
        lateArrivals: 0,
        incompleteAttendance: 0,
      },
      leaves: {
        sick: 0,
        annual: 0,
        business: 0,
        holidays: 0,
        unpaid: 0,
      },
      rates: {
        regularHourlyRate: 0,
        overtimeRate: 0,
        holidayRate: 0,
      },
      earnings: {
        baseAmount: 0,
        overtimeAmount: 0,
        holidayAmount: 0,
      },
      allowances: {
        transportation: 0,
        meal: 0,
        housing: 0,
        other: 0,
      },
      deductions: {
        socialSecurity: 0,
        tax: 0,
        other: 0,
      },
      adjustments: [],
      netPayable: 0,
      status: 'draft',
    };

    return res.status(200).json(emptyPayrollData);
  } catch (error) {
    console.error('Error in handleGetPayroll:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleCreatePayroll(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { employeeId, periodStart, periodEnd, payrollData } = req.body;

    if (!employeeId || !periodStart || !periodEnd || !payrollData) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Create or update payroll period
    const payrollPeriod = await prisma.payrollPeriod.upsert({
      where: {
        id: payrollData.periodId || '',
      },
      update: {
        status: payrollData.status as PayrollStatus,
      },
      create: {
        startDate: new Date(periodStart),
        endDate: new Date(periodEnd),
        status: 'draft',
      },
    });

    // Create or update payroll record
    const payroll = await prisma.payroll.upsert({
      where: {
        id: payrollData.id || '',
      },
      update: {
        ...formatPayrollInput(payrollData),
        status: payrollData.status as PayrollStatus,
      },
      create: {
        employeeId,
        payrollPeriodId: payrollPeriod.id,
        ...formatPayrollInput(payrollData),
        status: 'draft',
      },
    });

    return res.status(200).json(payroll);
  } catch (error) {
    console.error('Error in handleCreatePayroll:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function formatPayrollResponse(payroll: any): AdminPayrollData {
  // Format the payroll record into AdminPayrollData type
  // Implementation needed based on your data structure
  return {} as AdminPayrollData;
}

function formatPayrollInput(data: any) {
  // Format the input data for Prisma create/update
  // Implementation needed based on your data structure
  return {
    regularHours: data.hours.regularHours,
    overtimeHours: data.hours.overtimeHours,
    holidayHours: data.hours.holidayHours,
    holidayOvertimeHours: data.hours.holidayOvertimeHours,
    lateMinutes: data.attendance.totalLateMinutes,
    earlyLeaveMinutes: data.attendance.earlyDepartures,
    sickLeaveDays: data.leaves.sick,
    businessLeaveDays: data.leaves.business,
    annualLeaveDays: data.leaves.annual,
    unpaidLeaveDays: data.leaves.unpaid,
    basePayAmount: data.earnings.baseAmount,
    overtimeAmount: data.earnings.overtimeAmount,
    holidayAmount: data.earnings.holidayAmount,
    totalAllowances:
      data.allowances.transportation +
      data.allowances.meal +
      data.allowances.housing +
      data.allowances.other,
    totalDeductions:
      data.deductions.socialSecurity +
      data.deductions.tax +
      data.deductions.other,
    netPayable: data.netPayable,
  };
}

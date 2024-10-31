// pages/api/admin/payroll/calculate-payroll.ts
// REPLACEMENT: This replaces the existing calculate-payroll.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { PayrollCalculationService } from '@/services/PayrollCalculation/PayrollCalculationService';
import { parseISO } from 'date-fns';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { employeeId, periodStart, periodEnd } = req.body;

    // Validate input
    if (!employeeId || !periodStart || !periodEnd) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Fetch required data
    const [employee, timeEntries, leaveRequests, settings] = await Promise.all([
      prisma.user.findUnique({ where: { employeeId } }),
      prisma.timeEntry.findMany({
        where: {
          employeeId,
          date: {
            gte: parseISO(periodStart),
            lte: parseISO(periodEnd)
          }
        },
        include: {
          overtimeMetadata: true
        }
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId,
          status: 'approved',
          startDate: {
            lte: parseISO(periodEnd)
          },
          endDate: {
            gte: parseISO(periodStart)
          }
        }
      }),
      prisma.payrollSettings.findFirst()
    ]);

    if (!employee || !settings) {
      return res.status(404).json({ message: 'Employee or settings not found' });
    }

    // Initialize service and calculate payroll
    const payrollService = new PayrollCalculationService(
      JSON.parse(settings.overtimeRates as string),
      prisma
    );

    const result = await payrollService.calculatePayroll(
      employee,
      timeEntries,
      leaveRequests,
      parseISO(periodStart),
      parseISO(periodEnd)
    );

    // Create or update payroll record
    const payrollPeriod = await prisma.payrollPeriod.upsert({
      where: {
        period_range: {
          startDate: parseISO(periodStart),
          endDate: parseISO(periodEnd)
        }
      },
      update: {
        status: 'processing'
      },
      create: {
        startDate: parseISO(periodStart),
        endDate: parseISO(periodEnd),
        status: 'processing'
      }
    });

    const payroll = await prisma.payroll.upsert({
      where: {
        employee_period: {
          employeeId,
          payrollPeriodId: payrollPeriod.id
        }
      },
      update: {
        regularHours: result.hours.regularHours,
        overtimeHours: 
          result.hours.workdayOvertimeHours +
          result.hours.weekendShiftOvertimeHours +
        holidayOvertimeHours: result.hours.holidayOvertimeHours,
        basePayAmount: result.processedData.basePay,
        overtimeAmount: result.processedData.overtimePay,
        holidayAmount: 0,
        totalAllowances: Object.values(result.processedData.allowances).reduce((a, b) => a + b, 0),
        totalDeductions: result.processedData.deductions.total,
        netPayable: result.processedData.netPayable,
        status: 'draft'
      },
      create: {
        employeeId,
        payrollPeriodId: payrollPeriod.id,
        regularHours: result.hours.regularHours,
        overtimeHours: 
          result.hours.workdayOvertimeHours +
          result.hours.weekendShiftOvertimeHours +
          result.hours.holidayOvertimeHours,
        holidayHours: 0,
        holidayOvertimeHours: result.hours.holidayOvertimeHours,
        basePayAmount: result.processedData.basePay,
        overtimeAmount: result.processedData.overtimePay,
        holidayAmount: 0,
        totalAllowances: Object.values(result.processedData.allowances).reduce((a, b) => a + b, 0),
        totalDeductions: result.processedData.deductions.total,
        netPayable: result.processedData.netPayable,
        status: 'draft',
        lateMinutes: result.attendance.totalLateMinutes,
        earlyLeaveMinutes: result.attendance.earlyDepartures,
        sickLeaveDays: result.leaves.sick,
        businessLeaveDays: result.leaves.business,
        annualLeaveDays: result.leaves.annual,
        unpaidLeaveDays: result.leaves.unpaid
      }
    });

    // Store processing result
    await prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        periodStart: parseISO(periodStart),
        periodEnd: parseISO(periodEnd),
        totalWorkingDays: result.summary.totalWorkingDays,
        totalPresent: result.summary.totalPresent,
        totalAbsent: result.summary.totalAbsent,
        totalOvertimeHours: 
          result.hours.workdayOvertimeHours +
          result.hours.weekendShiftOvertimeHours +
          result.hours.holidayOvertimeHours,
        totalRegularHours: result.hours.regularHours,
        processedData: JSON.stringify(result)
      }
    });

    return res.status(200).json({
      payrollId: payroll.id,
      calculation: result
    });
  } catch (error) {
    console.error('Error calculating payroll:', error);
    return res.status(500).json({ message: 'Error calculating payroll' });
  }
}
// pages/api/admin/calculate-payroll.ts

import { GetServerSideProps, NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { PayrollCalculationService } from '@/services/PayrollCalculation/PayrollCalculationService';
import { ProbationAdjustmentService } from '@/services/PayrollCalculation/ProbationAdjustmentService';
import { formatISO, parseISO, startOfDay, endOfDay } from 'date-fns';

const prisma = new PrismaClient();

interface ProcessedTimeEntries {
  workingHours: {
    regularHours: number;
    workdayOvertimeHours: number;
    weekendShiftOvertimeHours: number;
    holidayOvertimeHours: number;
  };
  attendance: {
    presentDays: number;
    unpaidLeaveDays: number;
    paidLeaveDays: number;
    holidayDays: number;
    totalLateMinutes: number;
    earlyDepartures: number;
  };
  leaves: {
    sick: number;
    business: number;
    annual: number;
    unpaid: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, periodStart, periodEnd } = req.body;

  try {
    // 1. Fetch all required data
    const [employee, timeEntries, leaveRequests, holidays, settings] =
      await Promise.all([
        prisma.user.findUnique({
          where: { employeeId },
        }),
        prisma.timeEntry.findMany({
          where: {
            employeeId,
            date: {
              gte: startOfDay(parseISO(periodStart)),
              lte: endOfDay(parseISO(periodEnd)),
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
            startDate: {
              gte: startOfDay(parseISO(periodStart)),
            },
            endDate: {
              lte: endOfDay(parseISO(periodEnd)),
            },
          },
        }),
        prisma.holiday.findMany({
          where: {
            date: {
              gte: startOfDay(parseISO(periodStart)),
              lte: endOfDay(parseISO(periodEnd)),
            },
          },
        }),
        prisma.payrollSettings.findFirst(),
      ]);

    if (!employee || !settings) {
      return res
        .status(404)
        .json({ message: 'Employee or settings not found' });
    }

    // 2. Initialize service with settings
    const payrollService = new PayrollCalculationService({
      overtimeRates: JSON.parse(settings.overtimeRates as string),
      allowances: JSON.parse(settings.allowances as string),
      deductions: JSON.parse(settings.deductions as string),
      rules: JSON.parse(settings.overtimeRates as string).rules,
    });

    // 3. Calculate payroll
    const result = await payrollService.calculatePayroll(
      employee,
      timeEntries,
      leaveRequests,
      parseISO(periodStart),
      parseISO(periodEnd),
    );

    // 4. Create payroll record
    const payrollPeriod = await prisma.payrollPeriod.upsert({
      where: {
        startDate_endDate: {
          startDate: new Date(periodStart),
          endDate: new Date(periodEnd),
        },
      },
      update: {
        status: 'processing',
      },
      create: {
        startDate: new Date(periodStart),
        endDate: new Date(periodEnd),
        status: 'processing',
      },
    });

    // 5. Create payroll record
    const payroll = await prisma.payroll.create({
      data: {
        employeeId,
        payrollPeriodId: payrollPeriod.id,
        regularHours: result.regularHours,
        overtimeHours:
          result.overtimeBreakdown.workdayOutside.hours +
          result.overtimeBreakdown.weekendInside.hours +
          result.overtimeBreakdown.weekendOutside.hours,
        basePayAmount:
          (result.regularHours * employee.baseSalary!) /
          (employee.salaryType === 'monthly' ? 176 : 8),
        overtimeAmount:
          result.overtimeBreakdown.workdayOutside.amount +
          result.overtimeBreakdown.weekendInside.amount +
          result.overtimeBreakdown.weekendOutside.amount,
        totalAllowances:
          result.allowances.transportation +
          result.allowances.meal +
          result.allowances.housing,
        totalDeductions: result.deductions.total,
        netPayable: result.netPayable,
        status: 'draft',
      },
    });

    return res.status(200).json({
      payrollId: payroll.id,
      calculation: result,
    });
  } catch (error) {
    console.error('Error calculating payroll:', error);
    return res.status(500).json({ message: 'Error calculating payroll' });
  }
}

// Update the processTimeEntries function:
function processTimeEntries(
  timeEntries: any[],
  leaveRequests: any[],
  holidays: any[],
  periodStart: Date,
  periodEnd: Date,
): ProcessedTimeEntries {
  let workingHours = {
    regularHours: 0,
    workdayOvertimeHours: 0,
    weekendShiftOvertimeHours: 0,
    holidayOvertimeHours: 0,
  };

  let attendance = {
    presentDays: 0,
    unpaidLeaveDays: 0,
    paidLeaveDays: 0,
    holidayDays: holidays.length,
    totalLateMinutes: 0,
    earlyDepartures: 0,
  };

  let leaves = {
    sick: 0,
    business: 0,
    annual: 0,
    unpaid: 0,
  };

  // Process timeEntries...
  timeEntries.forEach((entry) => {
    workingHours.regularHours += entry.regularHours || 0;
    workingHours.workdayOvertimeHours += entry.overtimeHours || 0;
    if (entry.regularHours > 0) {
      attendance.presentDays++;
    }
    attendance.totalLateMinutes += entry.actualMinutesLate || 0;
  });

  // Process leaveRequests...
  leaveRequests.forEach((leave) => {
    const daysCount = leave.fullDayCount || 1;
    if (leave.leaveType === 'unpaid') {
      attendance.unpaidLeaveDays += daysCount;
      leaves.unpaid += daysCount;
    } else {
      attendance.paidLeaveDays += daysCount;
      switch (leave.leaveType.toLowerCase()) {
        case 'sick':
          leaves.sick += daysCount;
          break;
        case 'business':
          leaves.business += daysCount;
          break;
        case 'annual':
          leaves.annual += daysCount;
          break;
      }
    }
  });

  return { workingHours, attendance, leaves };
}

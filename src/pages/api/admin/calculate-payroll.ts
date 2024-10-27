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
    // 1. Fetch required data
    const [employee, timeEntries, leaveRequests, holidays] = await Promise.all([
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
    ]);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // 2. Process attendance and hours
    // Update the payroll creation:
    const { workingHours, attendance, leaves } = processTimeEntries(
      timeEntries,
      leaveRequests,
      holidays,
      parseISO(periodStart),
      parseISO(periodEnd),
    );

    // 3. Initialize services
    const payrollService = new PayrollCalculationService();
    const probationService = new ProbationAdjustmentService({
      basePayAdjustmentRate: 0.9,
      overtimeEligible: true,
      allowancesEligible: true,
    });

    // 4. Calculate payroll
    let result = payrollService.calculatePayroll({
      basePayAmount: employee.baseSalary || 0,
      employeeBaseType:
        employee.employeeType === 'Probation'
          ? employee.salaryType === 'monthly'
            ? 'FULLTIME'
            : 'PARTTIME'
          : employee.employeeType === 'Fulltime'
            ? 'FULLTIME'
            : 'PARTTIME',
      employeeStatus:
        employee.employeeType === 'Probation' ? 'PROBATION' : 'REGULAR',
      isGovernmentRegistered: employee.isGovernmentRegistered === 'Yes',
      workingHours,
      attendance,
      additionalAllowances: {}, // Add any additional allowances here
    });

    // 5. Apply probation adjustments if needed
    if (employee.employeeType === 'Probation') {
      result = probationService.adjustPayrollCalculation(result);
    }

    const existingPeriod = await prisma.payrollPeriod.findFirst({
      where: {
        startDate: new Date(periodStart),
        endDate: new Date(periodEnd),
      },
    });

    // 6. Create or update payroll record
    const payrollPeriod = await prisma.payrollPeriod.upsert({
      where: {
        id: existingPeriod?.id || '',
      },
      update: {},
      create: {
        startDate: new Date(periodStart),
        endDate: new Date(periodEnd),
        status: 'processing',
      },
    });

    const payroll = await prisma.payroll.create({
      data: {
        employeeId,
        payrollPeriodId: payrollPeriod.id,
        regularHours: workingHours.regularHours,
        overtimeHours:
          workingHours.workdayOvertimeHours +
          workingHours.weekendShiftOvertimeHours +
          workingHours.holidayOvertimeHours,
        holidayHours: attendance.holidayDays * 8,
        holidayOvertimeHours: workingHours.holidayOvertimeHours,
        lateMinutes: attendance.totalLateMinutes || 0,
        earlyLeaveMinutes: attendance.earlyDepartures || 0,
        sickLeaveDays: leaves.sick,
        businessLeaveDays: leaves.business,
        annualLeaveDays: leaves.annual,
        unpaidLeaveDays: leaves.unpaid,
        basePayAmount: result.actualBasePayAmount,
        overtimeAmount: result.overtimeAmount.total,
        holidayAmount: result.allowances.total,
        totalAllowances: result.allowances.total,
        totalDeductions: result.deductions.total,
        netPayable: result.netPayable,
        status: 'draft',
      },
    });

    // 7. Create processing result
    await prisma.payrollProcessingResult.create({
      data: {
        employeeId: employee.employeeId,
        periodStart: parseISO(periodStart),
        periodEnd: parseISO(periodEnd),
        totalWorkingDays:
          attendance.presentDays +
          attendance.paidLeaveDays +
          attendance.holidayDays,
        totalPresent: attendance.presentDays,
        totalAbsent: attendance.unpaidLeaveDays,
        totalOvertimeHours:
          workingHours.workdayOvertimeHours +
          workingHours.weekendShiftOvertimeHours +
          workingHours.holidayOvertimeHours,
        totalRegularHours: workingHours.regularHours,
        processedData: JSON.stringify(result),
        status: 'completed',
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

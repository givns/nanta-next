// pages/api/payroll/summary.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import {
  startOfDay,
  endOfDay,
  format,
  isSameDay,
  isWithinInterval,
  setDate,
  subMonths,
  addDays,
  parseISO,
} from 'date-fns';

const prisma = new PrismaClient();

// Types
interface PayrollAggregation {
  regularHours: number;
  overtimeHours: number;
  daysPresent: number;
  daysAbsent: number;
  lateMinutes: number;
  holidays: number;
}

interface PayrollEarnings {
  basePay: number;
  overtimePay: number;
  holidayPay: number;
  allowances: number;
  deductions: {
    socialSecurity: number;
    tax: number;
    other: number;
  };
  adjustments: Array<{
    type: string;
    amount: number;
    description: string;
  }>;
  netPayable: number;
}

interface PayrollSettings {
  regularHourlyRate: number;
  overtimeRate: number;
  holidayRate: number;
  allowances: {
    transportation: number;
    meal: number;
    housing: number;
  };
  deductions: {
    socialSecurity: number;
    tax: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { employeeId, periodStart, periodEnd } = req.query;

    if (!employeeId || typeof employeeId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid employeeId' });
    }

    // Calculate period dates if not provided
    let startDate: Date;
    let endDate: Date;

    if (periodStart && periodEnd) {
      startDate = startOfDay(parseISO(periodStart as string));
      endDate = endOfDay(parseISO(periodEnd as string));
    } else {
      const today = new Date();
      // If before the 26th, use previous month's period
      if (today.getDate() < 26) {
        startDate = setDate(subMonths(today, 2), 26);
        endDate = setDate(subMonths(today, 1), 25);
      } else {
        // Use current month's period
        startDate = setDate(subMonths(today, 1), 26);
        endDate = setDate(today, 25);
      }
    }

    // Check for existing processing result
    const payrollResult = await prisma.payrollProcessingResult.findFirst({
      where: {
        employeeId,
        periodStart: {
          gte: startDate,
        },
        periodEnd: {
          lte: endDate,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (payrollResult) {
      return res.status(200).json(payrollResult);
    }

    // Fetch all required data for calculation
    const [timeEntries, leaves, holidays, user] = await Promise.all([
      prisma.timeEntry.findMany({
        where: {
          employeeId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          attendance: true,
          overtimeRequest: true,
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId,
          status: 'Approved',
          startDate: {
            lte: endDate,
          },
          endDate: {
            gte: startDate,
          },
        },
      }),
      prisma.holiday.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
      prisma.user.findUnique({
        where: { employeeId },
        include: {
          department: true,
        },
      }),
    ]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate aggregations
    const aggregation = calculatePayrollAggregation(
      timeEntries,
      leaves,
      holidays,
      startDate,
      endDate,
    );

    // Calculate earnings
    const earnings = await calculateEarnings(
      aggregation,
      user.employeeType,
      startDate,
      endDate,
    );

    // Create new processing result
    const newPayrollResult = await prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        periodStart: startDate,
        periodEnd: endDate,
        totalWorkingDays: aggregation.daysPresent + aggregation.daysAbsent,
        totalPresent: aggregation.daysPresent,
        totalAbsent: aggregation.daysAbsent,
        totalOvertimeHours: aggregation.overtimeHours,
        totalRegularHours: aggregation.regularHours,
        processedData: JSON.stringify({
          ...earnings,
          aggregation,
          periodDetails: {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
          },
        }),
      },
    });

    return res.status(200).json(newPayrollResult);
  } catch (error) {
    console.error('Error processing payroll:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function calculatePayrollAggregation(
  timeEntries: any[],
  leaves: any[],
  holidays: any[],
  startDate: Date,
  endDate: Date,
): PayrollAggregation {
  const aggregation: PayrollAggregation = {
    regularHours: 0,
    overtimeHours: 0,
    daysPresent: 0,
    daysAbsent: 0,
    lateMinutes: 0,
    holidays: holidays.length,
  };

  // Group time entries by date
  const entriesByDate = timeEntries.reduce(
    (acc, entry) => {
      const dateKey = format(entry.date, 'yyyy-MM-dd');
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(entry);
      return acc;
    },
    {} as Record<string, typeof timeEntries>,
  );

  // Process each day in the period
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    const dayEntries = entriesByDate[dateKey] || [];
    const isHoliday = holidays.some((h) =>
      isSameDay(new Date(h.date), currentDate),
    );
    const isLeaveDay = leaves.some((l) =>
      isWithinInterval(currentDate, {
        start: new Date(l.startDate),
        end: new Date(l.endDate),
      }),
    );

    if (isHoliday || isLeaveDay) {
      // Don't count holidays or leave days as absent
      if (isHoliday) {
        aggregation.holidays++;
      }
    } else if (dayEntries.length > 0) {
      // Process working day
      aggregation.daysPresent++;
      for (const entry of dayEntries) {
        aggregation.regularHours += entry.regularHours;
        aggregation.overtimeHours += entry.overtimeHours;
        if (entry.actualMinutesLate > 0) {
          aggregation.lateMinutes += entry.actualMinutesLate;
        }
      }
    } else {
      // No entries found for working day
      aggregation.daysAbsent++;
    }

    currentDate = addDays(currentDate, 1);
  }

  return aggregation;
}

async function calculateEarnings(
  aggregation: PayrollAggregation,
  employeeType: string,
  startDate: Date,
  endDate: Date,
): Promise<PayrollEarnings> {
  // Get settings based on employee type
  const settings: PayrollSettings = {
    regularHourlyRate: employeeType === 'FULL_TIME' ? 62.5 : 45,
    overtimeRate: 1.5,
    holidayRate: 2.0,
    allowances: {
      transportation: employeeType === 'FULL_TIME' ? 1000 : 0,
      meal: employeeType === 'FULL_TIME' ? 1000 : 0,
      housing: employeeType === 'FULL_TIME' ? 1000 : 0,
    },
    deductions: {
      socialSecurity: 0.05,
      tax: 0.0,
    },
  };

  // Calculate base earnings
  const basePay = aggregation.regularHours * settings.regularHourlyRate;
  const overtimePay =
    aggregation.overtimeHours *
    settings.regularHourlyRate *
    settings.overtimeRate;
  const holidayPay =
    aggregation.holidays *
    8 *
    settings.regularHourlyRate *
    settings.holidayRate;

  // Calculate allowances
  const totalAllowances = Object.values(settings.allowances).reduce(
    (a, b) => a + b,
    0,
  );

  // Calculate gross pay
  const grossPay = basePay + overtimePay + holidayPay + totalAllowances;

  // Calculate deductions
  const socialSecurity = Math.min(
    grossPay * settings.deductions.socialSecurity,
    750,
  );
  const tax = calculateTax(grossPay);

  return {
    basePay,
    overtimePay,
    holidayPay,
    allowances: totalAllowances,
    deductions: {
      socialSecurity,
      tax,
      other: 0,
    },
    adjustments: [],
    netPayable: grossPay - socialSecurity - tax,
  };
}

function calculateTax(grossPay: number): number {
  if (grossPay <= 20000) return 0;

  // Simplified progressive tax calculation
  let tax = 0;
  let remainingPay = grossPay;

  if (remainingPay > 20000) {
    const taxableAmount = Math.min(remainingPay - 20000, 10000);
    tax += taxableAmount * 0.05;
    remainingPay -= taxableAmount;
  }

  if (remainingPay > 30000) {
    const taxableAmount = Math.min(remainingPay - 30000, 20000);
    tax += taxableAmount * 0.1;
    remainingPay -= taxableAmount;
  }

  if (remainingPay > 50000) {
    tax += (remainingPay - 50000) * 0.15;
  }

  return tax;
}

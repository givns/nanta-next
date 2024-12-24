// pages/api/admin/payroll/[employeeId].ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { PayrollCalculationService } from '@/services/PayrollCalculation/PayrollCalculationService';
import { PayrollSettingsData } from '@/types/payroll';
import { HolidayService } from '@/services/HolidayService';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { employeeId, periodStart, periodEnd } = req.query;

  try {
    // Fetch required data
    const [employee, timeEntries, leaveRequests, settings] = await Promise.all([
      prisma.user.findUnique({
        where: { employeeId: employeeId as string },
      }),
      prisma.timeEntry.findMany({
        where: {
          employeeId: employeeId as string,
          date: {
            gte: new Date(periodStart as string),
            lte: new Date(periodEnd as string),
          },
        },
        include: {
          overtimeMetadata: true,
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: employeeId as string,
          status: 'approved',
          startDate: {
            gte: new Date(periodStart as string),
          },
          endDate: {
            lte: new Date(periodEnd as string),
          },
        },
      }),
      prisma.payrollSettings.findFirst(),
    ]);

    if (!employee || !settings) {
      return res.status(404).json({ error: 'Employee or settings not found' });
    }

    // Parse JSON fields from settings
    const parsedSettings: PayrollSettingsData = {
      overtimeRates: JSON.parse(settings.overtimeRates as string),
      allowances: JSON.parse(settings.allowances as string),
      deductions: JSON.parse(settings.deductions as string),
      rules: JSON.parse(settings.rules as string),
    };

    // Initialize HolidayService

    const payrollService = new PayrollCalculationService(
      parsedSettings,
      prisma,
    );
    const payrollData = await payrollService.calculatePayroll(
      employee,
      timeEntries,
      leaveRequests,
      new Date(periodStart as string),
      new Date(periodEnd as string),
    );

    return res.status(200).json(payrollData);
  } catch (error) {
    console.error('Error calculating payroll:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

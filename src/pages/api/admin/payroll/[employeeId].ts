// pages/api/admin/payroll/[employeeId].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { PayrollCalculationService } from '@/services/PayrollCalculation/PayrollCalculationService';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { employeeId, periodStart, periodEnd } = req.query;

  try {
    // Fetch required data
    const [employee, timeEntries, leaveRequests, holidays, settings] =
      await Promise.all([
        prisma.user.findUnique({ where: { employeeId: employeeId as string } }),
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
        prisma.holiday.findMany({
          where: {
            date: {
              gte: new Date(periodStart as string),
              lte: new Date(periodEnd as string),
            },
          },
        }),
        prisma.payrollSettings.findFirst(),
      ]);

    if (!employee || !settings) {
      return res.status(404).json({ error: 'Employee or settings not found' });
    }

    const payrollService = new PayrollCalculationService(settings);
    const payrollData = await payrollService.calculatePayroll(
      employee,
      timeEntries,
      leaveRequests,
      holidays,
      new Date(periodStart as string),
      new Date(periodEnd as string),
    );

    return res.status(200).json(payrollData);
  } catch (error) {
    console.error('Error calculating payroll:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// pages/api/admin/payroll/verify-setup.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { parseISO } from 'date-fns';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'];
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { employeeId, periodStart, periodEnd } = req.query;
    console.log('Verifying setup for:', { employeeId, periodStart, periodEnd });

    // Check employee
    const employee = await prisma.user.findUnique({
      where: { employeeId: employeeId as string },
      select: {
        id: true,
        employeeId: true,
        name: true,
        departmentName: true,
        role: true,
        employeeType: true,
        baseSalary: true,
        salaryType: true,
      },
    });

    // Check settings
    const settings = await prisma.payrollSettings.findFirst();

    // Check time entries if dates provided
    let timeEntries = null;
    if (periodStart && periodEnd) {
      const startDate = parseISO(periodStart as string);
      const endDate = parseISO(periodEnd as string);

      timeEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: employeeId as string,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          date: true,
          entryType: true,
          regularHours: true,
          overtimeHours: true,
        },
      });
    }

    return res.status(200).json({
      employee: {
        exists: !!employee,
        data: employee
          ? {
              name: employee.name,
              department: employee.departmentName,
              hasBaseSalary: !!employee.baseSalary,
              employeeType: employee.employeeType,
            }
          : null,
      },
      settings: {
        exists: !!settings,
        data: settings
          ? {
              hasOvertimeRates: !!settings.overtimeRates,
            }
          : null,
      },
      timeEntries: timeEntries
        ? {
            count: timeEntries.length,
            types: [...new Set(timeEntries.map((e) => e.entryType))],
            totalRegularHours: timeEntries.reduce(
              (sum, e) => sum + e.regularHours,
              0,
            ),
            totalOvertimeHours: timeEntries.reduce(
              (sum, e) => sum + e.overtimeHours,
              0,
            ),
            dateRange: {
              start: periodStart,
              end: periodEnd,
            },
          }
        : null,
    });
  } catch (error) {
    console.error('Error in verify-setup:', error);
    return res.status(500).json({
      error: 'Verification failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

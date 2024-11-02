// pages/api/admin/payroll/verify-timeentries.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { parseISO } from 'date-fns';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const { employeeId, periodStart, periodEnd } = req.query;

    if (!employeeId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const startDate = parseISO(periodStart as string);
    const endDate = parseISO(periodEnd as string);

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId: employeeId as string,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Group and analyze the entries
    const analysis = {
      totalEntries: timeEntries.length,
      byType: timeEntries.reduce(
        (acc, entry) => {
          if (!acc[entry.entryType]) {
            acc[entry.entryType] = 0;
          }
          acc[entry.entryType]++;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byStatus: timeEntries.reduce(
        (acc, entry) => {
          if (!acc[entry.status]) {
            acc[entry.status] = 0;
          }
          acc[entry.status]++;
          return acc;
        },
        {} as Record<string, number>,
      ),
      regularHoursTotal: timeEntries.reduce(
        (sum, entry) => sum + entry.regularHours,
        0,
      ),
      overtimeHoursTotal: timeEntries.reduce(
        (sum, entry) => sum + entry.overtimeHours,
        0,
      ),
      dateRange: {
        start: startDate,
        end: endDate,
        totalDays:
          Math.ceil(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1,
      },
      sampleEntry: timeEntries[0]
        ? {
            date: timeEntries[0].date,
            type: timeEntries[0].entryType,
            regularHours: timeEntries[0].regularHours,
            status: timeEntries[0].status,
          }
        : null,
    };

    return res.status(200).json({
      success: true,
      analysis,
      message: `Found ${timeEntries.length} time entries for the period`,
    });
  } catch (error) {
    console.error('Error verifying time entries:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

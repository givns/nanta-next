// pages/api/admin/attendance/time-entries.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { startOfMonth, endOfMonth, parseISO, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { TimeEntriesResponse } from '@/types/attendance';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { employeeId, startDate, endDate } = req.query;

    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    const periodStart = startDate
      ? parseISO(startDate as string)
      : startOfMonth(new Date());
    const periodEnd = endDate
      ? parseISO(endDate as string)
      : endOfMonth(new Date());

    // Get payroll settings
    const settings = await prisma.payrollSettings.findFirst();
    const rules = (settings?.rules as any) || {};
    const periodStartDay = rules.payrollPeriodStart || 26;
    const periodEndDay = rules.payrollPeriodEnd || 25;

    // Get all attendance records, leaves, and time entries
    const [attendanceRecords, leaveRequests, timeEntries] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          employeeId: employeeId as string,
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        orderBy: { date: 'desc' }, // Latest first
        include: {
          timeEntries: true,
          overtimeEntries: {
            include: {
              overtimeRequest: true,
            },
          },
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: employeeId as string,
          status: 'Approved',
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
      }),
      prisma.timeEntry.findMany({
        where: {
          employeeId: employeeId as string,
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        include: {
          overtimeMetadata: true,
        },
      }),
    ]);

    // Transform to DetailedTimeEntry
    const records = attendanceRecords.map((attendance) => {
      const timeEntry = timeEntries.find(
        (te) => te.attendanceId === attendance.id,
      );
      const leave = leaveRequests.find(
        (lr) =>
          attendance.date >= lr.startDate && attendance.date <= lr.endDate,
      );

      return {
        date: format(attendance.date, 'yyyy-MM-dd'),
        regularCheckInTime: attendance.regularCheckInTime
          ? format(attendance.regularCheckInTime, 'HH:mm')
          : null,
        regularCheckOutTime: attendance.regularCheckOutTime
          ? format(attendance.regularCheckOutTime, 'HH:mm')
          : null,
        isLateCheckIn: attendance.isLateCheckIn || false,
        isLateCheckOut: attendance.isLateCheckOut || false,
        status: attendance.status,
        isManualEntry: attendance.isManualEntry,
        regularHours: timeEntry?.regularHours || 0,
        overtimeHours: timeEntry?.overtimeHours || 0,
        leave: leave
          ? {
              type: leave.leaveType,
              status: leave.status,
            }
          : null,
        overtimeDetails: attendance.overtimeEntries.map((oe) => ({
          startTime: oe.actualStartTime
            ? format(oe.actualStartTime, 'HH:mm')
            : null,
          endTime: oe.actualEndTime ? format(oe.actualEndTime, 'HH:mm') : null,
          status: oe.overtimeRequest?.status || 'pending',
        })),
        canEditManually: true,
      };
    });

    const response: TimeEntriesResponse = {
      employeeId: employeeId as string,
      periodStart: format(periodStart, 'yyyy-MM-dd'),
      periodEnd: format(periodEnd, 'yyyy-MM-dd'),
      records,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching time entries:', error);
    return res.status(500).json({
      error: 'Failed to fetch time entries',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

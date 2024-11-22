// pages/api/admin/attendance/time-entries.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { startOfMonth, endOfMonth, parseISO, format } from 'date-fns';
import {
  DetailedTimeEntry,
  PeriodType,
  TimeEntriesResponse,
} from '@/types/attendance';

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

    // Get all records with necessary includes
    const [attendanceRecords, leaveRequests] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          employeeId: employeeId as string,
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        orderBy: { date: 'desc' },
        include: {
          timeEntries: {
            include: {
              overtimeMetadata: true,
            },
          },
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
    ]);

    // Transform to DetailedTimeEntry
    const records: DetailedTimeEntry[] = attendanceRecords.map((attendance) => {
      const regularEntry = attendance.timeEntries.find(
        (te) => te.entryType === PeriodType.REGULAR,
      );
      const overtimeEntry = attendance.timeEntries.find(
        (te) => te.entryType === PeriodType.OVERTIME,
      );
      const leave = leaveRequests.find(
        (lr) =>
          attendance.date >= lr.startDate && attendance.date <= lr.endDate,
      );

      const overtimeData = attendance.overtimeEntries[0];

      return {
        date: format(attendance.date, 'yyyy-MM-dd'),
        regularCheckInTime: attendance.regularCheckInTime
          ? format(attendance.regularCheckInTime, 'HH:mm')
          : null, // Change undefined to null
        regularCheckOutTime: attendance.regularCheckOutTime
          ? format(attendance.regularCheckOutTime, 'HH:mm')
          : null, // Change undefined to null
        // Status and flags
        state: attendance.state,
        checkStatus: attendance.checkStatus,
        isLateCheckIn: attendance.isLateCheckIn || false,
        isLateCheckOut: attendance.isLateCheckOut || false,
        isManualEntry: attendance.isManualEntry,
        entryType: overtimeEntry ? PeriodType.OVERTIME : PeriodType.REGULAR,
        // Hours
        regularHours: regularEntry?.regularHours || 0,
        overtimeHours: overtimeEntry?.overtimeHours || 0,
        // Additional info
        leave: leave
          ? {
              type: leave.leaveType,
              status: leave.status,
            }
          : null, // Change undefined to null
        // Overtime info
        overtimeRequest: overtimeData?.overtimeRequest
          ? {
              id: overtimeData.overtimeRequest.id,
              startTime: overtimeData.overtimeRequest.startTime,
              endTime: overtimeData.overtimeRequest.endTime,
              actualStartTime: overtimeData.actualStartTime
                ? format(overtimeData.actualStartTime, 'HH:mm')
                : undefined,
              actualEndTime: overtimeData.actualEndTime
                ? format(overtimeData.actualEndTime, 'HH:mm')
                : undefined,
            }
          : undefined,
        canEditManually: true,
      };
    });

    return res.status(200).json({
      employeeId: employeeId as string,
      periodStart: format(periodStart, 'yyyy-MM-dd'),
      periodEnd: format(periodEnd, 'yyyy-MM-dd'),
      records,
    });
  } catch (error) {
    console.error('Error fetching time entries:', error);
    return res.status(500).json({
      error: 'Failed to fetch time entries',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

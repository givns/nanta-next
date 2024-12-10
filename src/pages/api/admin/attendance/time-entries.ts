import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { startOfMonth, endOfMonth, parseISO, format } from 'date-fns';
import {
  AttendanceState,
  CheckStatus,
  DetailedTimeEntry,
  PeriodType,
} from '@/types/attendance';

const prisma = new PrismaClient();

// Helper function to map string to AttendanceState enum
const mapToAttendanceState = (state: string): AttendanceState => {
  switch (state.toLowerCase()) {
    case 'present':
      return AttendanceState.PRESENT;
    case 'absent':
      return AttendanceState.ABSENT;
    case 'incomplete':
      return AttendanceState.INCOMPLETE;
    case 'holiday':
      return AttendanceState.HOLIDAY;
    case 'off':
      return AttendanceState.OFF;
    case 'overtime':
      return AttendanceState.OVERTIME;
    default:
      return AttendanceState.ABSENT;
  }
};

// Helper function to map string to CheckStatus enum
const mapToCheckStatus = (status: string): CheckStatus => {
  switch (status.toLowerCase()) {
    case 'checked-in':
      return CheckStatus.CHECKED_IN;
    case 'checked-out':
      return CheckStatus.CHECKED_OUT;
    default:
      return CheckStatus.PENDING;
  }
};

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

    // Get attendance records with careful null handling
    const [attendanceRecords, leaveRequests] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          employeeId: employeeId as string,
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
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
        orderBy: { date: 'desc' },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: employeeId as string,
          status: 'Approved',
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
      }),
      prisma.overtimeRequest.findMany({
        where: {
          employeeId: employeeId as string,
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
          status: 'approved',
        },
      }),
    ]);

    // Transform with proper enum mapping
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
      const overtimeRequest = overtimeData?.overtimeRequest;

      return {
        date: format(attendance.date, 'yyyy-MM-dd'),
        CheckInTime: attendance.CheckInTime
          ? format(attendance.CheckInTime, 'HH:mm')
          : null,
        CheckOutTime: attendance.CheckOutTime
          ? format(attendance.CheckOutTime, 'HH:mm')
          : null,

        // Map string values to proper enums
        state: mapToAttendanceState(attendance.state),
        checkStatus: mapToCheckStatus(attendance.checkStatus),
        isLateCheckIn: attendance.isLateCheckIn || false,
        isLateCheckOut: attendance.isLateCheckOut || false,
        isManualEntry: attendance.isManualEntry || false,

        // Type and hours
        entryType: overtimeEntry ? PeriodType.OVERTIME : PeriodType.REGULAR,
        regularHours: regularEntry?.regularHours || 0,
        overtimeHours: overtimeEntry?.overtimeHours || 0,

        // Leave info with null safety
        leave: leave
          ? {
              type: leave.leaveType,
              status: leave.status,
            }
          : null,

        // Overtime info with null safety
        overtimeRequest: overtimeRequest
          ? {
              id: overtimeRequest.id,
              startTime: overtimeRequest.startTime,
              endTime: overtimeRequest.endTime,
              actualStartTime: overtimeData?.actualStartTime
                ? format(overtimeData.actualStartTime, 'HH:mm')
                : undefined,
              actualEndTime: overtimeData?.actualEndTime
                ? format(overtimeData.actualEndTime, 'HH:mm')
                : undefined,
            }
          : undefined,

        canEditManually:
          !leave && (!overtimeRequest || overtimeRequest.status !== 'approved'),
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

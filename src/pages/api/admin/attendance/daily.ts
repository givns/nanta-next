import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma } from '@prisma/client';
import { startOfDay, endOfDay, parseISO, format } from 'date-fns';
import {
  AttendanceState,
  CheckStatus,
  DailyAttendanceRecord,
  OvertimeState,
  ShiftData,
  DateRange,
  DepartmentInfo,
  AttendanceFilters,
} from '@/types/attendance';

const prisma = new PrismaClient();

interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  onLeave: number;
  dayOff: number;
}

async function handleGetDailyAttendance(
  req: NextApiRequest,
  res: NextApiResponse,
  user: { role: string; departmentId: string | null; employeeId: string },
) {
  try {
    const { date: dateQuery, department, searchTerm } = req.query;
    const targetDate = dateQuery ? parseISO(dateQuery as string) : new Date();
    const dateStart = startOfDay(targetDate);
    const dateEnd = endOfDay(targetDate);

    // Build base query for department access
    const departmentFilter: Prisma.UserWhereInput =
      user.role === 'Admin' && user.departmentId
        ? { departmentId: user.departmentId }
        : department !== 'all'
          ? { departmentId: department as string }
          : {};

    // Build search filter
    const searchFilter: Prisma.UserWhereInput = searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm as string, mode: 'insensitive' } },
            {
              employeeId: {
                contains: searchTerm as string,
                mode: 'insensitive',
              },
            },
          ],
        }
      : {};

    // Get all users with their assigned shifts
    const users = await prisma.user.findMany({
      where: {
        AND: [departmentFilter, searchFilter].filter(
          (filter) => Object.keys(filter).length > 0,
        ),
      },
      select: {
        employeeId: true,
        name: true,
        departmentName: true,
        assignedShift: true,
      },
    });

    // Get attendance records
    const attendances = await prisma.attendance.findMany({
      where: {
        employeeId: { in: users.map((u) => u.employeeId) },
        date: {
          gte: dateStart,
          lt: dateEnd,
        },
      },
      include: {
        overtimeEntries: {
          include: {
            overtimeRequest: true,
          },
        },
      },
    });

    // Get leave requests
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: users.map((u) => u.employeeId) },
        startDate: { lte: dateEnd },
        endDate: { gte: dateStart },
        status: 'approved',
      },
    });

    const attendanceRecords: DailyAttendanceRecord[] = users.map((user) => {
      const attendance = attendances.find(
        (a) => a.employeeId === user.employeeId,
      );
      const leaveRequest = leaveRequests.find(
        (lr) => lr.employeeId === user.employeeId,
      );

      // Map shift data from user's assigned shift
      const shiftData: ShiftData | null = user.assignedShift
        ? {
            id: user.assignedShift.id,
            name: user.assignedShift.name,
            shiftCode: user.assignedShift.shiftCode,
            startTime: user.assignedShift.startTime,
            endTime: user.assignedShift.endTime,
            workDays: user.assignedShift.workDays,
          }
        : null;

      const record: DailyAttendanceRecord = {
        employeeId: user.employeeId,
        employeeName: user.name,
        departmentName: user.departmentName,
        date: format(targetDate, 'yyyy-MM-dd'),

        // Status fields
        state: (attendance?.state as AttendanceState) || AttendanceState.ABSENT,
        checkStatus:
          (attendance?.checkStatus as CheckStatus) || CheckStatus.PENDING,
        overtimeState: attendance?.overtimeState as OvertimeState | undefined,

        // Time fields
        CheckInTime: attendance?.CheckInTime
          ? format(attendance.CheckInTime, 'HH:mm')
          : null,
        CheckOutTime: attendance?.CheckOutTime
          ? format(attendance.CheckOutTime, 'HH:mm')
          : null,

        // Status flags
        isLateCheckIn: attendance?.isLateCheckIn || false,
        isLateCheckOut: attendance?.isLateCheckOut || false,
        isEarlyCheckIn: attendance?.isEarlyCheckIn || false,
        isVeryLateCheckOut: attendance?.isVeryLateCheckOut || false,
        lateCheckOutMinutes: attendance?.lateCheckOutMinutes || 0,

        // Shift and status info
        shift: shiftData,
        isDayOff: attendance?.isDayOff || false,
        leaveInfo: leaveRequest
          ? {
              type: leaveRequest.leaveType,
              status: leaveRequest.status,
            }
          : null,
      };

      return record;
    });

    // Get unique departments for filters
    const departments: DepartmentInfo[] = [
      ...new Set(users.map((e) => e.departmentName)),
    ]
      .filter(Boolean)
      .map((name) => ({
        id: name,
        name: name,
      }));

    // Prepare filters matching AttendanceFilters interface
    const filters: AttendanceFilters = {
      dateRange: {
        start: dateStart,
        end: dateEnd,
        isValid: true,
        duration: 1,
      },
      departments: department !== 'all' ? [department as string] : [],
      currentState: AttendanceState.PRESENT,
      searchTerm: (searchTerm as string) || '',
    };

    // Prepare response data
    const responseData = {
      // Full unfiltered records
      records: attendanceRecords,
      // Initially same as records, frontend will handle filtering
      filteredRecords: attendanceRecords,
      // Simple department array as expected by SearchFilters
      departments,
      filters,
    };

    // Add cache headers
    res.setHeader('Cache-Control', 'private, max-age=30');

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    return res.status(500).json({
      error: 'Failed to fetch attendance records',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true, departmentId: true, employeeId: true },
    });

    if (!user || !['Admin', 'SuperAdmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return handleGetDailyAttendance(req, res, user);
  } catch (error) {
    console.error('Error in daily attendance API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    await prisma.$disconnect();
  }
}

// pages/api/admin/attendance/daily.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma, LeaveRequest } from '@prisma/client';
import { startOfDay, endOfDay, parseISO, format, isValid } from 'date-fns';
import { DailyAttendanceResponse } from '@/types/attendance';
import { getCacheData, setCacheData } from '@/lib/serverCache';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { LeaveServiceServer } from '@/services/LeaveServiceServer';
import { NotificationService } from '@/services/NotificationService';

const CACHE_TTL = 5 * 60; // 5 minutes cache
const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);
const holidayService = new HolidayService(prisma);
const shiftService = new ShiftManagementService(prisma, holidayService);
const leaveService = new LeaveServiceServer(prisma, notificationService);

const parseDateSafely = (dateString: string | undefined): Date => {
  if (!dateString) return new Date();

  try {
    const parsed = parseISO(dateString);
    return isValid(parsed) ? parsed : new Date();
  } catch (error) {
    console.error('Error parsing date:', error);
    return new Date();
  }
};

async function handleGetDailyAttendance(
  req: NextApiRequest,
  res: NextApiResponse,
  user: { role: string; departmentId: string | null; employeeId: string },
) {
  try {
    const { date: dateQuery, department, searchTerm } = req.query;
    const targetDate = parseDateSafely(dateQuery as string);
    const dateStart = startOfDay(targetDate);
    const dateEnd = endOfDay(targetDate);

    // Create cache key
    const cacheKey = `daily-attendance:${format(targetDate, 'yyyy-MM-dd')}:${department || 'all'}:${searchTerm || ''}`;

    // Try cached data
    const cachedData = await getCacheData(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

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
            {
              name: {
                contains: searchTerm as string,
                mode: 'insensitive',
              },
            },
            {
              employeeId: {
                contains: searchTerm as string,
                mode: 'insensitive',
              },
            },
          ],
        }
      : {};

    // Combine filters
    const whereCondition: Prisma.UserWhereInput = {
      AND: [departmentFilter, searchFilter].filter(
        (filter) => Object.keys(filter).length > 0,
      ),
    };

    const employees = await prisma.user.findMany({
      where: whereCondition,
      select: {
        employeeId: true,
        name: true,
        departmentName: true,
        shiftCode: true,
        assignedShift: {
          select: {
            name: true,
            startTime: true,
            endTime: true,
          },
        },
        attendances: {
          where: {
            date: {
              gte: dateStart,
              lt: dateEnd,
            },
          },
          select: {
            id: true,
            regularCheckInTime: true,
            regularCheckOutTime: true,
            isLateCheckIn: true,
            isLateCheckOut: true,
            isEarlyCheckIn: true,
            isVeryLateCheckOut: true,
            lateCheckOutMinutes: true,
            status: true,
            isDayOff: true,
          },
        },
      },
    });

    // Get all required data with proper error handling
    const [holidays, leaveRequests] = await Promise.all([
      holidayService.getHolidays(dateStart, dateEnd).catch((error) => {
        console.error('Error fetching holidays:', error);
        return []; // Return empty array on error instead of failing
      }),
      leaveService.getUserLeaveRequests(targetDate).catch((error) => {
        console.error('Error fetching leave requests:', error);
        return []; // Return empty array on error instead of failing
      }),
    ]);

    const attendanceRecords: DailyAttendanceResponse[] = await Promise.all(
      employees.map(async (employee) => {
        try {
          const attendance = employee.attendances[0];
          // Wrap holiday check in try-catch
          const isHoliday = await holidayService
            .isHoliday(targetDate, holidays, employee.shiftCode === 'SHIFT104')
            .catch(() => false); // Default to false if check fails

          const leaveRequest = leaveRequests.find(
            (lr: LeaveRequest) => lr.employeeId === employee.employeeId,
          );

          return {
            employeeId: employee.employeeId,
            employeeName: employee.name,
            departmentName: employee.departmentName || '',
            date: format(targetDate, 'yyyy-MM-dd'),
            shift: employee.assignedShift
              ? {
                  name: employee.assignedShift.name,
                  startTime: employee.assignedShift.startTime,
                  endTime: employee.assignedShift.endTime,
                }
              : null,
            attendance: attendance
              ? {
                  id: attendance.id,
                  regularCheckInTime: formatAttendanceTime(
                    attendance.regularCheckInTime,
                  ),
                  regularCheckOutTime: formatAttendanceTime(
                    attendance.regularCheckOutTime,
                  ),
                  isLateCheckIn: attendance.isLateCheckIn ?? false,
                  isLateCheckOut: attendance.isLateCheckOut ?? false,
                  isEarlyCheckIn: attendance.isEarlyCheckIn ?? false,
                  isVeryLateCheckOut: attendance.isVeryLateCheckOut ?? false,
                  lateCheckOutMinutes: attendance.lateCheckOutMinutes ?? 0,
                  status: attendance.status,
                }
              : null,
            isDayOff: isHoliday || attendance?.isDayOff || false,
            leaveInfo: leaveRequest
              ? {
                  type: leaveRequest.leaveType,
                  status: leaveRequest.status,
                }
              : null,
          };
        } catch (error) {
          console.error(
            `Error processing employee ${employee.employeeId}:`,
            error,
          );
          // Return a safe default record if processing fails
          return {
            employeeId: employee.employeeId,
            employeeName: employee.name || '',
            departmentName: employee.departmentName || '',
            date: format(targetDate, 'yyyy-MM-dd'),
            shift: null,
            attendance: null,
            isDayOff: false,
            leaveInfo: null,
          };
        }
      }),
    );

    // Cache results
    await setCacheData(cacheKey, JSON.stringify(attendanceRecords), CACHE_TTL);

    return res.status(200).json(attendanceRecords);
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    return res.status(500).json({
      error: 'Failed to fetch attendance records',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

const formatAttendanceTime = (date: Date | null): string | null => {
  if (!date) return null;
  try {
    // Ensure we're working with a valid date
    const validDate = new Date(date);
    if (isNaN(validDate.getTime())) {
      return null;
    }
    return format(validDate, 'HH:mm');
  } catch (error) {
    console.error('Error formatting date:', error);
    return null;
  }
};

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

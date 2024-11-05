// pages/api/admin/attendance/daily.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, PrismaClient } from '@prisma/client';
import { AttendanceService } from '@/services/AttendanceService';
import { HolidayService } from '@/services/HolidayService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { startOfDay, endOfDay, parseISO, format } from 'date-fns';
import { DailyAttendanceResponse } from '@/types/attendance';
import { getCacheData, setCacheData } from '@/lib/serverCache';

const CACHE_TTL = 5 * 60; // 5 minutes cache
const prisma = new PrismaClient();

// Initialize services
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
const shiftService = new ShiftManagementService(prisma, holidayService);
const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const timeEntryService = new TimeEntryService(
  prisma,
  shiftService,
  notificationService,
);
const overtimeService = new OvertimeServiceServer(
  prisma,
  holidayService,
  leaveServiceServer,
  shiftService,
  timeEntryService,
  notificationService,
);

// Initialize AttendanceService
const attendanceService = new AttendanceService(
  prisma,
  shiftService,
  holidayService,
  leaveServiceServer,
  overtimeService,
  notificationService,
  timeEntryService,
);

async function handleGetDailyAttendance(
  req: NextApiRequest,
  res: NextApiResponse,
  user: { role: string; departmentId: string | null; employeeId: string },
) {
  try {
    const { date, department, searchTerm } = req.query;
    const targetDate = date ? parseISO(date as string) : new Date();

    // Create cache key
    const cacheKey = `daily-attendance:${format(targetDate, 'yyyy-MM-dd')}:${department || 'all'}:${searchTerm || ''}`;

    // Try cached data
    const cachedData = await getCacheData(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    // Build base query
    const baseWhereInput: Prisma.UserWhereInput = {
      // Department filter based on user role
      ...(user.role === 'Admin' && user.departmentId
        ? { departmentId: user.departmentId }
        : department !== 'all'
          ? { departmentId: department as string }
          : {}),
    };

    // Add search conditions
    const whereInput: Prisma.UserWhereInput = searchTerm
      ? {
          ...baseWhereInput,
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
      : baseWhereInput;

    // Fetch employees with optimized select
    const employees = await prisma.user.findMany({
      where: whereInput,
      select: {
        id: true,
        employeeId: true,
        name: true,
        departmentName: true,
        shiftCode: true,
        attendances: {
          where: {
            date: {
              gte: startOfDay(targetDate),
              lt: endOfDay(targetDate),
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
            checkInAddress: true,
            checkOutAddress: true,
            isDayOff: true,
          },
        },
      },
    });

    // Process employee data in parallel
    const attendanceRecords: DailyAttendanceResponse[] = await Promise.all(
      employees.map(async (employee) => {
        const [shiftData, attendanceStatus] = await Promise.all([
          shiftService.getEffectiveShiftAndStatus(
            employee.employeeId,
            targetDate,
          ),
          attendanceService.getLatestAttendanceStatus(employee.employeeId),
        ]);

        const attendance = employee.attendances[0];

        return {
          employeeId: employee.employeeId,
          employeeName: employee.name,
          departmentName: employee.departmentName,
          date: format(targetDate, 'yyyy-MM-dd'),
          shift: shiftData?.effectiveShift
            ? {
                startTime: shiftData.effectiveShift.startTime,
                endTime: shiftData.effectiveShift.endTime,
                name: shiftData.effectiveShift.name,
              }
            : null,
          attendance: attendance
            ? {
                id: attendance.id,
                regularCheckInTime:
                  attendance.regularCheckInTime?.toISOString() || null,
                regularCheckOutTime:
                  attendance.regularCheckOutTime?.toISOString() || null,
                isLateCheckIn: attendance.isLateCheckIn ?? false,
                isLateCheckOut: attendance.isLateCheckOut ?? false,
                isEarlyCheckIn: attendance.isEarlyCheckIn ?? false,
                isVeryLateCheckOut: attendance.isVeryLateCheckOut,
                lateCheckOutMinutes: attendance.lateCheckOutMinutes,
                status: attendance.status,
                checkInAddress: attendance.checkInAddress || null,
                checkOutAddress: attendance.checkOutAddress || null,
                isDayOff: attendance.isDayOff,
              }
            : null,
        };
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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

    switch (req.method) {
      case 'GET':
        return handleGetDailyAttendance(req, res, user);
      default:
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in daily attendance API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

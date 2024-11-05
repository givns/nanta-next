// pages/api/admin/attendance/daily.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma } from '@prisma/client';
import { startOfDay, endOfDay, parseISO, format } from 'date-fns';
import { DailyAttendanceResponse } from '@/types/attendance';
import { getCacheData, setCacheData } from '@/lib/serverCache';

const CACHE_TTL = 5 * 60; // 5 minutes cache
const prisma = new PrismaClient();

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

    // Single query to get all required data
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
            checkInAddress: true,
            checkOutAddress: true,
            isDayOff: true,
          },
        },
      },
    });

    // Transform the data
    const attendanceRecords: DailyAttendanceResponse[] = employees.map(
      (employee) => {
        const attendance = employee.attendances[0];
        return {
          employeeId: employee.employeeId,
          employeeName: employee.name,
          departmentName: employee.departmentName,
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
      },
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

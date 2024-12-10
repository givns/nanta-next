// pages/api/admin/attendance/daily.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma, LeaveRequest } from '@prisma/client';
import { startOfDay, endOfDay, parseISO, format, isValid } from 'date-fns';
import {
  AttendanceState,
  CheckStatus,
  DailyAttendanceRecord,
  OvertimeState,
  ShiftData,
} from '@/types/attendance';
import { getCacheData, setCacheData } from '@/lib/serverCache';
import { ShiftManagementService } from '@/services/ShiftManagementService/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { LeaveServiceServer } from '@/services/LeaveServiceServer';
import { NotificationService } from '@/services/NotificationService';
import { initializeServices } from '@/services/ServiceInitializer';
import { AttendanceService } from '@/services/Attendance/AttendanceService';
import { AttendanceMappers } from '@/services/Attendance/utils/AttendanceMappers';

const CACHE_TTL = 5 * 60; // 5 minutes cache
const prisma = new PrismaClient();
const services = initializeServices(prisma);
const attendanceService = new AttendanceService(
  prisma,
  services.shiftService,
  services.holidayService,
  services.leaveService,
  services.overtimeService,
  services.notificationService,
  services.timeEntryService,
);

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
        attendances: {
          where: {
            date: {
              gte: dateStart,
              lt: dateEnd,
            },
          },
          select: {
            id: true,
            state: true,
            checkStatus: true,
            overtimeState: true,
            CheckInTime: true,
            CheckOutTime: true,
            isLateCheckIn: true,
            isLateCheckOut: true,
            isEarlyCheckIn: true,
            isVeryLateCheckOut: true,
            lateCheckOutMinutes: true,
            isDayOff: true,
          },
        },
      },
    });

    // Get all required data with proper error handling
    const [holidays, leaveRequests] = await Promise.all([
      services.holidayService.getHolidays(dateStart, dateEnd).catch((error) => {
        console.error('Error fetching holidays:', error);
        return []; // Return empty array on error instead of failing
      }),
      services.leaveService.getUserLeaveRequests(targetDate).catch((error) => {
        console.error('Error fetching leave requests:', error);
        return []; // Return empty array on error instead of failing
      }),
    ]);

    const attendanceRecords: DailyAttendanceRecord[] = await Promise.all(
      employees.map(async (employee) => {
        try {
          const now = new Date();
          const attendance = employee.attendances[0];
          // Wrap holiday check in try-catch
          const isHoliday = await services.holidayService
            .isHoliday(targetDate, holidays, employee.shiftCode === 'SHIFT104')
            .catch(() => false); // Default to false if check fails

          const leaveRequest = leaveRequests.find(
            (lr: LeaveRequest) => lr.employeeId === employee.employeeId,
          );

          const effectiveShiftResult =
            await services.shiftService.getEffectiveShiftAndStatus(
              employee.employeeId,
              now,
            );

          const record: DailyAttendanceRecord = {
            employeeId: employee.employeeId,
            employeeName: employee.name,
            departmentName: employee.departmentName || '',
            date: format(targetDate, 'yyyy-MM-dd'),

            // Status fields with proper mapping
            state: AttendanceMappers.mapToAttendanceState(attendance?.state),
            checkStatus: AttendanceMappers.mapToCheckStatus(
              attendance?.checkStatus,
            ),
            overtimeState: AttendanceMappers.mapToOvertimeState(
              attendance?.overtimeState,
            ),

            // Time fields
            CheckInTime: formatAttendanceTime(attendance?.CheckInTime),
            CheckOutTime: formatAttendanceTime(attendance?.CheckOutTime),

            // Flag fields
            isLateCheckIn: attendance?.isLateCheckIn ?? false,
            isLateCheckOut: attendance?.isLateCheckOut ?? false,
            isEarlyCheckIn: attendance?.isEarlyCheckIn ?? false,
            isVeryLateCheckOut: attendance?.isVeryLateCheckOut ?? false,
            lateCheckOutMinutes: attendance?.lateCheckOutMinutes ?? 0,

            // Related data
            shift: effectiveShiftResult?.effectiveShift
              ? {
                  id: effectiveShiftResult.effectiveShift.id,
                  name: effectiveShiftResult.effectiveShift.name,
                  shiftCode: effectiveShiftResult.effectiveShift.shiftCode,
                  startTime: effectiveShiftResult.effectiveShift.startTime,
                  endTime: effectiveShiftResult.effectiveShift.endTime,
                  workDays: effectiveShiftResult.effectiveShift.workDays,
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

          return record;
        } catch (error) {
          console.error(
            `Error processing employee ${employee.employeeId}:`,
            error,
          );
          // Return a safe default record if processing fails
          const defaultRecord: DailyAttendanceRecord = {
            employeeId: employee.employeeId,
            employeeName: employee.name || '',
            departmentName: employee.departmentName || '',
            date: format(targetDate, 'yyyy-MM-dd'),
            // Ensure required enum values are set
            state: AttendanceState.ABSENT,
            checkStatus: CheckStatus.PENDING,
            overtimeState: undefined,
            // Required time fields
            CheckInTime: null,
            CheckOutTime: null,
            // Required boolean flags
            isLateCheckIn: false,
            isLateCheckOut: false,
            isEarlyCheckIn: false,
            isVeryLateCheckOut: false,
            lateCheckOutMinutes: 0,
            // Other required fields
            shift: null,
            isDayOff: false,
            leaveInfo: null,
          };
          return defaultRecord;
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

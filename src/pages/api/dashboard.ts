// pages/api/dashboard.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  LeaveRequest,
  PrismaClient,
  Shift,
  TimeEntry,
  User,
} from '@prisma/client';
import { cacheService } from '@/services/cache/CacheService';
import { addDays, format } from 'date-fns';
import { initializeServices } from '@/services/ServiceInitializer';

const prisma = new PrismaClient();
const services = initializeServices(prisma);
const { attendanceService } = services;

const getPayrollPeriod = (date: Date = new Date()) => {
  const currentMonth = new Date(date);
  const currentDay = currentMonth.getDate();

  let periodStart: Date;
  let periodEnd: Date;

  if (currentDay <= 25) {
    // If current day is 25 or before, period is from previous month's 26th to current month's 25th
    periodStart = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      26,
    );
    periodEnd = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      25,
    );
  } else {
    // If after 25th, period is from current month's 26th to next month's 25th
    periodStart = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      26,
    );
    periodEnd = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      25,
    );
  }

  return { start: periodStart, end: periodEnd };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId } = req.query;
  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(400).json({ error: 'Invalid lineUserId' });
  }

  try {
    const cacheKey = `dashboard:${lineUserId}`;
    let dashboardData = cacheService ? await cacheService.get(cacheKey) : null;

    if (!dashboardData) {
      // Get user data
      const user = await prisma.user.findUnique({
        where: { lineUserId },
        include: {
          department: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get shift data
      const shift = user?.shiftCode
        ? await services.shiftService.getShiftByCode(user.shiftCode)
        : null;

      const effectiveShift =
        await services.shiftService.getEffectiveShiftAndStatus(user.employeeId);
      // Accessing workDays with a default value to avoid errors
      const workDays = effectiveShift?.regularShift?.workDays || [];
      const isWorkDay = (day: number) => workDays.includes(day);

      // Get current payroll period
      const payrollPeriod = getPayrollPeriod();

      // Fetch all required data in parallel
      const [
        attendanceStatus,
        timeEntries,
        leaveData,
        leaveRequests,
        workingDays,
      ] = await Promise.all([
        attendanceService.getAttendanceStatus(user.employeeId, {
          inPremises: false,
          address: '',
        }),
        services.timeEntryService.getTimeEntriesForEmployee(
          user.employeeId,
          payrollPeriod.start,
          payrollPeriod.end,
        ),
        services.leaveService.checkLeaveBalance(user.employeeId),
        prisma.leaveRequest.findMany({
          where: {
            employeeId: user.employeeId,
            startDate: {
              gte: payrollPeriod.start,
            },
            endDate: {
              lte: payrollPeriod.end,
            },
          },
        }),
        calculateWorkingDays(payrollPeriod.start, payrollPeriod.end, shift),
      ]);

      const dashboardData = {
        user,
        attendanceStatus,
        effectiveShift,
        payrollAttendance: timeEntries,
        totalWorkingDays: workingDays,
        totalPresent: timeEntries.length,
        totalAbsent: calculateAbsentDays(
          timeEntries,
          workingDays,
          leaveRequests,
        ),
        overtimeHours: calculateOvertimeHours(timeEntries),
        balanceLeave: getTotalLeaveBalance(user),
        payrollPeriod: {
          startDate: payrollPeriod.start.toISOString(),
          endDate: payrollPeriod.end.toISOString(),
        },
      };

      // Logging the structure before caching and returning
      console.log('Verified Dashboard Data:', dashboardData);

      if (cacheService) {
        await cacheService.set(cacheKey, JSON.stringify(dashboardData), 300);
      }

      return res.status(200).json(dashboardData);
    }

    return res.status(200).json(JSON.parse(dashboardData));
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper functions remain the same but moved outside handler
const isWorkingDay = (
  date: Date,
  workDays: number[],
  shiftCode: string | null,
): boolean => {
  const dayOfWeek = date.getDay();
  return workDays.includes(dayOfWeek);
};

// Calculate working days in a period
const calculateWorkingDays = async (
  startDate: Date,
  endDate: Date,
  shift: Shift | null,
): Promise<number> => {
  if (!shift) return 0;

  let workingDays = 0;
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    // Check if it's a working day according to shift
    if (isWorkingDay(currentDate, shift.workDays, shift.shiftCode)) {
      // Check if it's not a holiday
      const isHoliday = await services.holidayService.isHoliday(
        currentDate,
        [], // Empty array as we'll check within the service
        shift.shiftCode === 'SHIFT104', // Special handling for afternoon shift
      );

      if (!isHoliday) {
        workingDays++;
      }
    }
    currentDate = addDays(currentDate, 1);
  }

  return workingDays;
};

// Calculate absent days
const calculateAbsentDays = (
  timeEntries: TimeEntry[],
  workingDays: number,
  leaveRequests: LeaveRequest[],
): number => {
  // Get dates with time entries or approved leaves
  const datesWithAttendance = new Set(
    timeEntries.map((entry) => format(entry.date, 'yyyy-MM-dd')),
  );

  // Add approved leave dates
  leaveRequests.forEach((leave) => {
    if (leave.status === 'Approved') {
      let currentDate = new Date(leave.startDate);
      while (currentDate <= new Date(leave.endDate)) {
        datesWithAttendance.add(format(currentDate, 'yyyy-MM-dd'));
        currentDate = addDays(currentDate, 1);
      }
    }
  });

  // Absent days are working days minus days with attendance/leave
  return workingDays - datesWithAttendance.size;
};

// Calculate overtime hours
const calculateOvertimeHours = (timeEntries: TimeEntry[]): number => {
  return timeEntries.reduce((total, entry) => {
    return total + (entry.overtimeHours || 0);
  }, 0);
};

// Get total leave balance
const getTotalLeaveBalance = (user: User): number => {
  return (
    (user.sickLeaveBalance || 0) +
    (user.businessLeaveBalance || 0) +
    (user.annualLeaveBalance || 0)
  );
};

// pages/api/dashboard.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { UserData } from '../../types/user';
import { HolidayService } from '../../services/HolidayService';
import { UserRole } from '../../types/enum';
import { ShiftData } from '@/types/attendance';

const holidayService = new HolidayService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    console.log('API: Invalid lineUserId');
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    console.log('API: Fetching user data');

    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 26);
    const endDate = new Date(today.getFullYear(), today.getMonth(), 25);

    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        assignedShift: true,
        department: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [recentAttendance, holidays] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          employeeId: user.employeeId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          id: true,
          employeeId: true,
          date: true,
          regularCheckInTime: true,
          regularCheckOutTime: true,
          overtimeEntries: true,
          checkInLocation: true,
          checkOutLocation: true,
          checkInAddress: true,
          checkOutAddress: true,
          checkInReason: true,
          checkInPhoto: true,
          checkOutPhoto: true,
          status: true,
          isManualEntry: true,
        },
      }),
      holidayService.getHolidays(startDate, endDate),
    ]);

    const totalDaysInPeriod = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24),
    );
    const totalWorkingDays = calculateTotalWorkingDays(
      totalDaysInPeriod,
      user.assignedShift?.workDays ?? [],
      holidays.length,
    );

    const totalPresent = await prisma.attendance.count({
      where: {
        employeeId: user.employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        regularCheckInTime: { not: null },
        regularCheckOutTime: { not: null },
      },
    });

    const totalAbsent = totalWorkingDays - totalPresent;
    const overtimeHours = user.overtimeHours || 0;
    const balanceLeave = await calculateLeaveBalance(user.id);

    const userData: UserData = {
      lineUserId: user.lineUserId,
      name: user.name,
      nickname: user.nickname,
      departmentId: user.departmentId!,
      departmentName: user.departmentName,
      employeeId: user.employeeId,
      role: user.role as UserRole,
      shiftId: user.shiftId!,
      shiftCode: user.shiftCode,
      profilePictureUrl: user.profilePictureUrl,
      overtimeHours: user.overtimeHours,

      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };

    const responseData = {
      user: userData,
      recentAttendance: recentAttendance.map((attendance) => ({
        ...attendance,
        attendanceTime: null,
        isOvertime: false,
        isDayOff: false,
        overtimeHours: 0,
        overtimeDuration: null,
      })),
      totalWorkingDays,
      totalPresent,
      totalAbsent,
      overtimeHours,
      balanceLeave,
    };

    console.log('API: User data fetched successfully');
    console.log('API: Response data:', JSON.stringify(responseData, null, 2));

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function calculateTotalWorkingDays(
  totalDays: number,
  workDays: number[],
  holidays: number,
): number {
  const workingDaysPerWeek = workDays.length;
  const weeks = Math.floor(totalDays / 7);
  const remainingDays = totalDays % 7;

  let totalWorkingDays = weeks * workingDaysPerWeek;

  for (let i = 0; i < remainingDays; i++) {
    if (workDays.includes((i + 1) % 7)) {
      totalWorkingDays++;
    }
  }

  return totalWorkingDays - holidays;
}

async function calculateLeaveBalance(employeeId: string): Promise<number> {
  // Fetch the user's leave balance from the database
  const user = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      annualLeaveBalance: true,
      sickLeaveBalance: true,
      businessLeaveBalance: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Sum up all types of leave balances
  const totalLeaveBalance =
    (user.annualLeaveBalance || 0) +
    (user.sickLeaveBalance || 0) +
    (user.businessLeaveBalance || 0);

  return totalLeaveBalance;
}

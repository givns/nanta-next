import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { UserData, ShiftData, AttendanceRecord } from '../../types/user';
import { HolidayService } from '../../services/HolidayService';
import { UserRole } from '@/types/enum';

const holidayService = new HolidayService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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

    let user = await prisma.user.findUnique({
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
          userId: user.id,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          id: true,
          userId: true,
          date: true,
          checkInTime: true,
          checkOutTime: true,
          overtimeStartTime: true,
          overtimeEndTime: true,
          checkInLocation: true,
          checkOutLocation: true,
          checkInAddress: true,
          checkOutAddress: true,
          checkInReason: true,
          checkOutReason: true,
          checkInPhoto: true,
          checkOutPhoto: true,
          checkInDeviceSerial: true,
          checkOutDeviceSerial: true,
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
      user.assignedShift.workDays,
      holidays.length,
    );

    const totalPresent = await prisma.attendance.count({
      where: {
        userId: user.id,
        date: {
          gte: startDate,
          lte: endDate,
        },
        checkInTime: { not: null },
        checkOutTime: { not: null },
      },
    });

    const totalAbsent = totalWorkingDays - totalPresent;
    const overtimeHours = user.overtimeHours || 0;
    const balanceLeave = await calculateLeaveBalance(user.id);

    const userData: UserData & { assignedShift: ShiftData } = {
      id: user.id,
      lineUserId: user.lineUserId,
      name: user.name,
      nickname: user.nickname || '',
      departmentId: user.departmentId,
      department: user.department.name,
      employeeId: user.employeeId,
      role: user.role as UserRole,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift as ShiftData,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const responseData = {
      user: userData,
      recentAttendance: recentAttendance as AttendanceRecord[],
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

async function calculateLeaveBalance(userId: string): Promise<number> {
  // Implement leave balance calculation logic here
  // This could involve fetching the user's leave requests and calculating the remaining balance
  // For now, we'll return a placeholder value
  return 10;
}

import { NextApiRequest, NextApiResponse } from 'next';
import { UserData, ShiftData, PotentialOvertime } from '../../types/user';
import { AttendanceService } from '../../services/AttendanceService';
import { HolidayService } from '../../services/HolidayService';
import { UserRole } from '../../types/enum';
import moment from 'moment-timezone';
import { PrismaClient } from '@prisma/client';
import { ExternalDbService } from '../../services/ExternalDbService';
import { Shift104HolidayService } from '../../services/Shift104HolidayService';
import { NotificationService } from '../../services/NotificationService';
import { leaveServiceServer } from '@/services/LeaveServiceServer';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();

const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
  leaveServiceServer,
);
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    const today = moment().tz('Asia/Bangkok');
    const startDate =
      moment(today).date() >= 26
        ? moment(today).date(26).startOf('day')
        : moment(today).subtract(1, 'month').date(26).startOf('day');
    const endDate = moment(startDate)
      .add(1, 'month')
      .subtract(1, 'day')
      .endOf('day');

    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        assignedShift: true,
        department: true,
        potentialOvertimes: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const processedAttendance = await attendanceService.getHistoricalAttendance(
      user.employeeId,
      startDate.toDate(),
      endDate.toDate(),
    );

    const holidays = await holidayService.getHolidays(
      startDate.toDate(),
      endDate.toDate(),
    );
    const totalDaysInPeriod = endDate.diff(startDate, 'days') + 1;
    const totalWorkingDays = calculateTotalWorkingDays(
      totalDaysInPeriod,
      user.assignedShift.workDays,
      holidays.length,
    );

    const totalPresent = processedAttendance.filter(
      (a) => a.status === 'present',
    ).length;
    const totalAbsent = totalWorkingDays - totalPresent;
    const overtimeHours = processedAttendance.reduce(
      (sum, a) => sum + (a.overtimeHours || 0),
      0,
    );
    const balanceLeave = await calculateLeaveBalance(user.id);

    const userData: UserData = {
      lineUserId: user.lineUserId,
      name: user.name,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      employeeId: user.employeeId,
      role: user.role as UserRole,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift as ShiftData,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      overtimeHours: user.overtimeHours,
      potentialOvertimes: user.potentialOvertimes.map((po) => ({
        id: po.id,
        employeeId: po.employeeId,
        date: po.date,
        hours: po.hours,
        type: po.type as 'early-check-in' | 'late-check-out' | 'day-off',
        status: po.status as 'pending' | 'approved' | 'rejected',
        periods: po.periods ? JSON.parse(po.periods as string) : undefined,
        reviewedBy: po.reviewedBy ?? undefined,
        reviewedAt: po.reviewedAt ?? undefined,
        createdAt: po.createdAt,
        updatedAt: po.updatedAt,
      })),
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const responseData = {
      user: userData,
      payrollAttendance: processedAttendance,
      totalWorkingDays,
      totalPresent,
      totalAbsent,
      overtimeHours,
      balanceLeave,
      payrollPeriod: {
        start: startDate.format('YYYY-MM-DD'),
        end: endDate.format('YYYY-MM-DD'),
      },
    };

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

async function calculateLeaveBalance(id: string): Promise<number> {
  // Implement leave balance calculation logic here
  // This could involve fetching the user's leave requests and calculating the remaining balance
  // For now, we'll return a placeholder value
  return 10;
}

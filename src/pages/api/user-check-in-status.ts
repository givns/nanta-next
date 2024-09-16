//api/
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { HolidayService } from '@/services/HolidayService';
import { Shift104HolidayService } from '@/services/Shift104HolidayService';
import { UserData } from '../../types/user';
import {
  ShiftAdjustment,
  ApprovedOvertime,
  AttendanceStatusInfo,
} from '@/types/attendance';
import { UserRole } from '@/types/enum';
import { startOfDay } from 'date-fns';
import { LeaveServiceServer } from '@/services/LeaveServiceServer';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { NotificationService } from '@/services/NotificationService';
import { OvertimeNotificationService } from '@/services/OvertimeNotificationService';
import { TimeEntryService } from '@/services/TimeEntryService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const shift104HolidayService = new Shift104HolidayService();
const shiftManagementService = new ShiftManagementService(prisma);
const notificationService = new NotificationService();
const overtimeNotificationService = new OvertimeNotificationService();
const timeEntryService = new TimeEntryService(prisma);
const leaveServiceServer = new LeaveServiceServer();

const overtimeService = new OvertimeServiceServer(
  prisma,
  overtimeNotificationService,
  timeEntryService,
);

const attendanceService = new AttendanceService(
  prisma,
  shiftManagementService,
  holidayService,
  leaveServiceServer,
  overtimeService,
  notificationService,
  timeEntryService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        department: true,
        potentialOvertimes: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const today = startOfDay(new Date());

    // Fetch the effective shift
    const effectiveShift = await shiftManagementService.getEffectiveShift(
      user.employeeId,
      today,
    );

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      departmentName: user.departmentName || '',
      role: user.role as UserRole,
      profilePictureUrl: user.profilePictureUrl,
      shiftId: effectiveShift?.id || null,
      shiftCode: effectiveShift?.shiftCode || null,
      overtimeHours: user.overtimeHours,
      potentialOvertimes: user.potentialOvertimes.map((overtime) => ({
        ...overtime,
        type: overtime.type as 'early-check-in' | 'late-check-out' | 'day-off',
        status: overtime.status as 'approved' | 'pending' | 'rejected',
        periods: overtime.periods as
          | { start: string; end: string }[]
          | undefined,
        reviewedBy: overtime.reviewedBy || undefined,
        reviewedAt: overtime.reviewedAt ?? undefined,
      })),
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };

    const attendanceStatus = await attendanceService.getLatestAttendanceStatus(
      user.employeeId,
    );

    const approvedOvertime = await overtimeService.getApprovedOvertimeRequest(
      user.employeeId,
      today,
    );

    const responseData = {
      user: userData,
      attendanceStatus,
      effectiveShift,
      approvedOvertime,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user check-in data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

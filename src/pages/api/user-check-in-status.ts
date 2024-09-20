//api/user-check-in-status.ts
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
import { Redis } from 'ioredis';
import { AppError } from '../../utils/errorHandler';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const shift104HolidayService = new Shift104HolidayService();
const shiftManagementService = new ShiftManagementService(prisma);
const notificationService = new NotificationService();
const overtimeNotificationService = new OvertimeNotificationService();
const timeEntryService = new TimeEntryService(prisma, shiftManagementService);
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

  const { lineUserId, forceRefresh } = req.query;

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
      if (!user) throw new AppError('User not found', 404);
    }

    const today = new Date();
    let effectiveShift, attendanceStatus, approvedOvertime, checkInOutAllowance;

    try {
      effectiveShift = await shiftManagementService.getEffectiveShift(
        user.employeeId,
        today,
      );
    } catch (shiftError) {
      console.error('Error getting effective shift:', shiftError);
      return res.status(500).json({
        error: 'Error getting effective shift',
        details: (shiftError as Error).message,
      });
    }

    try {
      attendanceStatus = await attendanceService.getLatestAttendanceStatus(
        user.id,
        forceRefresh === 'true',
      );
    } catch (attendanceError) {
      console.error('Error getting attendance status:', attendanceError);
      return res.status(500).json({
        error: 'Error getting attendance status',
        details: (attendanceError as Error).message,
      });
    }

    try {
      approvedOvertime = await overtimeService.getApprovedOvertimeRequest(
        user.employeeId,
        today,
      );
    } catch (overtimeError) {
      console.error('Error getting approved overtime:', overtimeError);
      return res.status(500).json({
        error: 'Error getting approved overtime',
        details: (overtimeError as Error).message,
      });
    }

    const responseData = {
      user: {
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
          type: overtime.type as
            | 'early-check-in'
            | 'late-check-out'
            | 'day-off',
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
      },
      attendanceStatus,
      effectiveShift,
      approvedOvertime,
      checkInOutAllowance,
    };

    res.status(200).json(responseData);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Error fetching user check-in data', 500);
  }
}

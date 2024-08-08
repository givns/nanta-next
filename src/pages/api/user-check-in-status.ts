// pages/api/user-check-in-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '@/services/ExternalDbService';
import { HolidayService } from '@/services/HolidayService';
import { Shift104HolidayService } from '@/services/Shift104HolidayService';
import {
  UserData,
  AttendanceStatus,
  ShiftAdjustment,
  ApprovedOvertime,
} from '../../types/user';
import moment from 'moment-timezone';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();
const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
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
        assignedShift: true,
        department: true,
        potentialOvertimes: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      role: user.role as any, // Cast to UserRole enum if necessary
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift,
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
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const attendanceStatus = await attendanceService.getLatestAttendanceStatus(
      user.employeeId,
    );

    const today = moment().tz('Asia/Bangkok').startOf('day');
    const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId: user.employeeId,
        date: today.toDate(),
        status: 'approved',
      },
      include: { requestedShift: true },
    });

    const approvedOvertime = await prisma.approvedOvertime.findFirst({
      where: {
        employeeId: user.employeeId,
        date: today.toDate(),
      },
    });

    const responseData = {
      user: userData,
      attendanceStatus,
      shiftAdjustment: shiftAdjustment
        ? ({
            date: shiftAdjustment.date.toISOString().split('T')[0],
            requestedShiftId: shiftAdjustment.requestedShiftId,
            requestedShift: shiftAdjustment.requestedShift,
            status: shiftAdjustment.status,
            reason: shiftAdjustment.reason,
            createdAt: shiftAdjustment.createdAt,
            updatedAt: shiftAdjustment.updatedAt,
          } as ShiftAdjustment)
        : null,
      approvedOvertime: approvedOvertime
        ? ({
            id: approvedOvertime.id,
            employeeId: approvedOvertime.employeeId,
            date: approvedOvertime.date,
            startTime: approvedOvertime.startTime.toISOString(),
            endTime: approvedOvertime.endTime.toISOString(),
            status: approvedOvertime.status,
            approvedBy: approvedOvertime.approvedBy,
            approvedAt: approvedOvertime.approvedAt,
          } as ApprovedOvertime)
        : null,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user check-in data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

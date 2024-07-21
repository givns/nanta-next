// pages/api/dashboard.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import moment from 'moment-timezone';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(400).json({ message: 'Invalid LINE User ID' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        attendances: true,
        leaveRequests: {
          where: { status: 'Approved' },
        },
        overtimeRequests: {
          where: { status: 'Approved' },
        },
        assignedShift: true,
        department: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = moment().tz('Asia/Bangkok');
    const startDate = moment(now)
      .date(26)
      .month(now.month() - 1)
      .startOf('day');
    const endDate = moment(now).date(25).endOf('day');

    // Calculate total working days
    let totalWorkingDays = 0;
    let currentDate = startDate.clone();
    while (currentDate.isSameOrBefore(endDate)) {
      if (user.assignedShift.workDays.includes(currentDate.day())) {
        totalWorkingDays++;
      }
      currentDate.add(1, 'day');
    }

    // Subtract holidays
    const holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
    });
    totalWorkingDays -= holidays.length;

    // Calculate total present days
    const totalPresent = user.attendances.filter(
      (attendance) =>
        moment(attendance.date).isBetween(startDate, endDate) &&
        attendance.checkInTime &&
        attendance.checkOutTime,
    ).length;

    const totalAbsent = user.leaveRequests.filter((leave) =>
      moment(leave.startDate).isBetween(startDate, endDate),
    ).length;

    const overtimeHours = user.overtimeRequests.reduce((total, req) => {
      if (moment(req.date).isBetween(startDate, endDate)) {
        const start = moment(req.date).set({
          hour: parseInt(req.startTime.split(':')[0]),
          minute: parseInt(req.startTime.split(':')[1]),
        });
        const end = moment(req.date).set({
          hour: parseInt(req.endTime.split(':')[0]),
          minute: parseInt(req.endTime.split(':')[1]),
        });

        // Handle overnight overtime
        if (end.isBefore(start)) {
          end.add(1, 'day');
        }

        const duration = moment.duration(end.diff(start)).asHours();
        return total + duration;
      }
      return total;
    }, 0);

    const balanceLeave =
      user.annualLeaveBalance +
      user.sickLeaveBalance +
      user.businessLeaveBalance;

    res.status(200).json({
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        name: user.name,
        nickname: user.nickname,
        departmentId: user.departmentId,
        department: user.department.name,
        employeeId: user.employeeId,
        role: user.role,
        shiftId: user.shiftId,
        assignedShift: user.assignedShift,
        profilePictureUrl: user.profilePictureUrl,
        profilePictureExternal: user.profilePictureExternal,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      recentAttendance: user.attendances.slice(0, 5), // Get the 5 most recent attendances
      totalWorkingDays,
      totalPresent,
      totalAbsent,
      overtimeHours,
      balanceLeave,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
}

// pages/api/attendance/missing-checkin.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '@/services/NotificationService';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId, checkOutTime } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [shiftStartHour, shiftStartMinute] = user.assignedShift.startTime
      .split(':')
      .map(Number);
    const potentialStartTime = new Date(today);
    potentialStartTime.setHours(shiftStartHour, shiftStartMinute);

    // Create a pending attendance record
    const pendingAttendance = await prisma.attendance.create({
      data: {
        userId: user.id,
        date: today,
        checkInTime: potentialStartTime,
        checkOutTime: new Date(checkOutTime),
        status: 'PENDING_APPROVAL',
        checkInLocation: 'UNKNOWN',
        checkOutLocation: 'UNKNOWN',
      },
    });

    // Send flex message to admins
    const admins = await prisma.user.findMany({ where: { role: 'Admin' } });
    for (const admin of admins) {
      await notificationService.notifyAdminsOfMissingCheckIn(
        userId,
        user.employeeId,
        potentialStartTime.toLocaleTimeString(),
        checkOutTime.toLocaleTimeString(),
        pendingAttendance.id,
      );
    }

    res.status(200).json({
      message: 'Pending attendance record created and admins notified',
    });
  } catch (error) {
    console.error('Error handling missing check-in:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// api/overtime/request.ts
import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import { OvertimeServiceServer } from '../../../services/OvertimeServiceServer';
import { TimeEntryService } from '../../../services/TimeEntryService';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import { createNotificationService } from '../../../services/NotificationService';
import { HolidayService } from '@/services/HolidayService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';

const prisma = new PrismaClient();
// Initialize services
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
const shiftService = new ShiftManagementService(prisma);
const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const timeEntryService = new TimeEntryService(prisma, shiftService);

const overtimeService = new OvertimeServiceServer(
  prisma,
  holidayService,
  leaveServiceServer,
  shiftService,
  timeEntryService,
  notificationService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId, date, startTime, endTime, reason, isDayOff } = req.body;

  if (!lineUserId || !date || !startTime || !endTime || !reason) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newOvertimeRequest = await overtimeService.createOvertimeRequest(
      lineUserId,
      date,
      startTime,
      endTime,
      reason,
    );

    res.status(201).json({
      success: true,
      message: 'Overtime request created successfully',
      data: newOvertimeRequest,
    });
  } catch (error: any) {
    console.error('Error creating overtime request:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

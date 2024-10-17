// api/overtime/request.ts
import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import { OvertimeServiceServer } from '../../../services/OvertimeServiceServer';
import { TimeEntryService } from '../../../services/TimeEntryService';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import { createNotificationService } from '../../../services/NotificationService';

const prisma = new PrismaClient();
export const notificationService = createNotificationService(prisma);
const shiftManagementService = new ShiftManagementService(prisma);
const timeEntryService = new TimeEntryService(prisma, shiftManagementService);
const overtimeService = new OvertimeServiceServer(
  prisma,
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
      isDayOff || false,
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

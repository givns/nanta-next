// pages/api/admin/attendance/overtime/reject.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '@/services/NotificationService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { HolidayService } from '@/services/HolidayService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { TimeEntryService } from '@/services/TimeEntryService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);
const holidayService = new HolidayService(prisma);
const shiftService = new ShiftManagementService(prisma, holidayService);
const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const timeEntryService = new TimeEntryService(
  prisma,
  shiftService,
  notificationService,
);

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

  const { requestId, rejectedBy, lineUserId } = req.body;

  if (!lineUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Reject overtime request
    await overtimeService.rejectOvertimeRequest(requestId, rejectedBy);

    return res.status(200).json({
      message: 'Overtime request rejected successfully',
    });
  } catch (error) {
    console.error('Error rejecting overtime request:', error);
    return res.status(500).json({
      message: 'Failed to reject overtime request',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

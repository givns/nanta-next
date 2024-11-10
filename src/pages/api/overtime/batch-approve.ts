// pages/api/overtime/batchApprove.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { OvertimeServiceServer } from '../../../services/OvertimeServiceServer';
import { TimeEntryService } from '../../../services/TimeEntryService';
import {
  NotificationService,
  createNotificationService,
} from '../../../services/NotificationService';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';

const prisma = new PrismaClient();
// Initialize services
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
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
// Initialize OvertimeServiceServer with new dependencies

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
  if (req.method === 'POST') {
    try {
      const { requestIds, approverId } = req.body;

      const approvedRequests =
        await overtimeService.batchApproveOvertimeRequests(
          requestIds,
          approverId,
        );

      res
        .status(200)
        .json({ message: 'Requests approved successfully', approvedRequests });
    } catch (error) {
      console.error('Error approving overtime requests:', error);
      res.status(500).json({ message: 'Error approving overtime requests' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

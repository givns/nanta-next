// pages/api/overtime/batchApprove.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { OvertimeServiceServer } from '../../../services/OvertimeServiceServer';
import { TimeEntryService } from '../../../services/TimeEntryService';
import { NotificationService } from '../../../services/NotificationService';
import { ShiftManagementService } from '../../../services/ShiftManagementService';

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);
const shiftService = new ShiftManagementService(prisma);
const timeEntryService = new TimeEntryService(prisma, shiftService);
const overtimeService = new OvertimeServiceServer(
  prisma,
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

// pages/api/overtime/batchApprove.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import { AttendanceService } from '@/services/Attendance/AttendanceService';

const prisma = new PrismaClient();
const services = initializeServices(prisma);
const attendanceService = new AttendanceService(
  prisma,
  services.shiftService,
  services.holidayService,
  services.leaveService,
  services.overtimeService,
  services.notificationService,
  services.timeEntryService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { requestIds, approverId } = req.body;

      const approvedRequests =
        await services.overtimeService.batchApproveOvertimeRequests(
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

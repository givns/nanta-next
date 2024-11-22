// pages/api/admin/attendance/overtime/reject.ts
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
    await services.overtimeService.rejectOvertimeRequest(requestId, rejectedBy);

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

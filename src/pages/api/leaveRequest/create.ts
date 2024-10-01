import type { NextApiRequest, NextApiResponse } from 'next';
import { createLeaveServiceServer } from '../../../services/LeaveServiceServer';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '@/services/NotificationService';

const prisma = new PrismaClient();
export const notificationService = createNotificationService(prisma);
export const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const {
    lineUserId,
    leaveType,
    leaveFormat,
    reason,
    startDate,
    endDate,
    fullDayCount,
    resubmitted,
    originalRequestId,
  } = req.body;

  try {
    const newLeaveRequest = await leaveServiceServer.createLeaveRequest(
      lineUserId,
      leaveType,
      leaveFormat,
      reason,
      startDate,
      endDate,
      fullDayCount,
      resubmitted,
      originalRequestId,
    );

    return res.status(201).json(newLeaveRequest);
  } catch (error: any) {
    console.error('Error creating leave request:', error);
    return res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
}

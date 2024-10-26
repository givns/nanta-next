// pages/api/leaveRequest/deny.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { createNotificationService } from '@/services/NotificationService';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);
const leaveService = createLeaveServiceServer(prisma, notificationService);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed`,
    });
  }

  const { requestId, denierEmployeeId } = req.body;

  if (!requestId || !denierEmployeeId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields',
    });
  }

  try {
    const deniedRequest = await leaveService.denyLeaveRequest(
      requestId,
      denierEmployeeId,
    );

    return res.status(200).json({
      success: true,
      message: 'Leave request denied successfully',
      data: deniedRequest,
    });
  } catch (error) {
    console.error('Error denying leave request:', error);

    if (error instanceof Error) {
      // Handle specific error cases
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

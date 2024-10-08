// pages/api/leaveRequest/deny.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { LeaveRequestService } from '../../../services/LeaveRequestService';
import { NotificationService } from '../../../services/NotificationService';

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);
const leaveRequestService = new LeaveRequestService(
  prisma,
  notificationService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { requestId, denierEmployeeId, denialReason } = req.body;

    try {
      // First, initiate the denial
      await leaveRequestService.initiateDenial(requestId, denierEmployeeId);

      // Then, finalize the denial
      const deniedRequest = await leaveRequestService.finalizeDenial(
        requestId,
        denierEmployeeId,
        denialReason,
      );

      res.status(200).json({
        success: true,
        message: 'Leave request denied successfully',
        data: deniedRequest,
      });
    } catch (error: any) {
      console.error('Error denying leave request:', error.message);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

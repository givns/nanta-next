// pages/api/leaveRequest/approve.ts
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
    const { requestId, approverEmployeeId } = req.body;

    try {
      const approvedRequest = await leaveRequestService.approveRequest(
        requestId,
        approverEmployeeId,
      );
      res.status(200).json({
        success: true,
        message: 'Leave request approved successfully',
        data: approvedRequest,
      });
    } catch (error: any) {
      console.error('Error approving leave request:', error.message);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

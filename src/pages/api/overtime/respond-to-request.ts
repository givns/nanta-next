// pages/api/overtime/respond-to-request.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../../../services/NotificationService';
import { UserRole } from '../../../types/enum';

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { requestId, action, lineUserId } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const overtimeRequest = await prisma.overtimeRequest.findUnique({
      where: { id: requestId },
    });

    if (!overtimeRequest || overtimeRequest.employeeId !== user.employeeId) {
      return res.status(404).json({
        message: 'Overtime request not found or not associated with this user',
      });
    }

    const updatedRequest = await prisma.overtimeRequest.update({
      where: { id: requestId },
      data: { status: action === 'accept' ? 'accepted' : 'declined' },
    });

    // Notify the approver about the employee's response
    if (updatedRequest.approverId) {
      const approver = await prisma.user.findUnique({
        where: { id: updatedRequest.approverId },
      });
      if (approver) {
        await notificationService.sendOvertimeResponseNotification(
          approver.id,
          user,
          updatedRequest,
        );
      }
    }

    res.status(200).json({
      message: 'Response recorded successfully',
      data: updatedRequest,
    });
  } catch (error) {
    console.error('Error processing overtime request response:', error);
    res
      .status(500)
      .json({ message: 'Error processing overtime request response' });
  }
}

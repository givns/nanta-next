import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../../../services/NotificationService';

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
      include: { approver: true },
    });

    if (!overtimeRequest || overtimeRequest.employeeId !== user.employeeId) {
      return res.status(404).json({
        message: 'Overtime request not found or not associated with this user',
      });
    }

    const updatedRequest = await prisma.overtimeRequest.update({
      where: { id: requestId },
      data: { employeeResponse: action === 'accept' ? 'accepted' : 'declined' },
    });

    // Notify the approver about the employee's response
    if (overtimeRequest.approver && overtimeRequest.approver.lineUserId) {
      await notificationService.sendOvertimeResponseNotification(
        overtimeRequest.approver.employeeId,
        overtimeRequest.approver.lineUserId,
        user,
        updatedRequest,
      );
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

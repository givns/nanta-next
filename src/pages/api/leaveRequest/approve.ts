import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import {
  sendApproveNotification,
  notifyAdmins,
} from '../../../utils/sendNotifications';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { leaveRequestId, adminId } = req.body;

  try {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: 'Approved', approverId: adminId },
    });

    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    if (!admin || !user) {
      throw new Error('Admin or user not found');
    }

    // Send notifications
    await sendApproveNotification(user, leaveRequest, admin);
    await notifyAdmins(leaveRequest);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error approving leave request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await prisma.$disconnect();
  }
}

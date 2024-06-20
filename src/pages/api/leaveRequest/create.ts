import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { sendLeaveRequestNotification } from '../../../utils/sendLeaveRequestNotification';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const {
      userId,
      leaveType,
      leaveFormat,
      reason,
      startDate,
      endDate,
      status,
      fullDayCount,
    } = req.body;

    try {
      const leaveRequest = await prisma.leaveRequest.create({
        data: {
          userId,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status,
          fullDayCount,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (user) {
        await sendLeaveRequestNotification(user, leaveRequest);
      }

      res.status(201).json({ success: true, data: leaveRequest });
    } catch (error) {
      console.error('Error creating leave request:', error);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    } finally {
      await prisma.$disconnect();
    }
  } else if (req.method === 'PATCH') {
    const { requestId, action } = req.body;

    try {
      const leaveRequest = await prisma.leaveRequest.findUnique({
        where: { id: requestId },
      });

      if (!leaveRequest) {
        return res
          .status(404)
          .json({ success: false, error: 'Leave request not found' });
      }

      if (leaveRequest.status !== 'Pending') {
        return res.status(400).json({
          success: false,
          error: 'Leave request has already been processed',
        });
      }

      const updatedRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: action === 'approve' ? 'Approved' : 'Denied' },
      });

      res.status(200).json({ success: true, data: updatedRequest });
    } catch (error) {
      console.error('Error updating leave request:', error);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['POST', 'PATCH']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

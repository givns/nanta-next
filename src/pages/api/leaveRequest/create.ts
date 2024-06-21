import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { notifyAdmins } from '../../../utils/sendLeaveRequestNotification';

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
      const user = await prisma.user.findUnique({
        where: { lineUserId: userId },
      });

      if (!user) {
        return res
          .status(400)
          .json({ success: false, error: 'User not found' });
      }

      const leaveRequest = await prisma.leaveRequest.create({
        data: {
          userId: user.id,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status,
          fullDayCount,
        },
      });

      await notifyAdmins(leaveRequest);

      res.status(201).json({ success: true, data: leaveRequest });
    } catch (error) {
      console.error('Error creating leave request:', error);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

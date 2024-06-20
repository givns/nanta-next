// pages/api/leaveRequest/create.ts
import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ObjectId } from 'mongodb';
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
          userId: new ObjectId(userId).toString(),
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
        where: { id: new ObjectId(userId).toString() },
      });

      if (user) {
        await sendLeaveRequestNotification(user, leaveRequest);
      }

      res.status(201).json({ success: true, data: leaveRequest });
    } catch (error: any) {
      console.error('Error creating leave request:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        details: error.message,
      });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

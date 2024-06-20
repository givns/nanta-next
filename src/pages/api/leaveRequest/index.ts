import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { sendLeaveRequestNotification } from '../../../utils/sendLeaveRequestNotification';

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
      fullDayCount,
    } = req.body;

    try {
      const newLeaveRequest = await prisma.leaveRequest.create({
        data: {
          userId,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: 'Pending', // Ensure the status field is included
          fullDayCount,
        },
      });

      const user = await prisma.user.findUnique({
        where: { lineUserId: userId },
      });

      if (user) {
        await sendLeaveRequestNotification(user, newLeaveRequest);
      }

      res.status(201).json(newLeaveRequest);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else if (req.method === 'GET') {
    try {
      const leaveRequests = await prisma.leaveRequest.findMany();
      res.status(200).json(leaveRequests);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

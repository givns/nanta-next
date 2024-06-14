import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';
import { sendLeaveRequestNotification } from '../../utils/sendLeaveRequestNotification';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const {
      userId,
      leaveType,
      reason,
      startDate,
      endDate,
      status,
      leaveFormat,
    } = req.body;

    try {
      // Create a new leave request
      const newLeaveRequest = await prisma.leaveRequest.create({
        data: {
          userId,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status,
        },
      });

      // Fetch the user to send notification
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (user) {
        await sendLeaveRequestNotification(user, newLeaveRequest);
      }

      res.status(201).json(newLeaveRequest);
    } catch (error: any) {
      console.error('Error creating leave request:', error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      await prisma.$disconnect();
    }
  } else if (req.method === 'GET') {
    try {
      const leaveRequests = await prisma.leaveRequest.findMany();
      res.status(200).json(leaveRequests);
    } catch (error: any) {
      console.error('Error fetching leave requests:', error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

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
      reason,
      startDate,
      endDate,
      status,
      leaveFormat,
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
          status,
        },
      });

      // Find super admins and admins
      const superAdmins = await prisma.user.findMany({
        where: {
          role: 'superadmin',
        },
      });

      const admins = await prisma.user.findMany({
        where: {
          role: 'admin',
        },
      });

      const recipients = [...superAdmins, ...admins];

      // Send notifications to super admins and admins
      for (const recipient of recipients) {
        await sendLeaveRequestNotification(recipient, newLeaveRequest);
      }

      res.status(201).json(newLeaveRequest);
    } catch (error: any) {
      console.error('Error creating leave request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  } else if (req.method === 'GET') {
    try {
      const leaveRequests = await prisma.leaveRequest.findMany();
      res.status(200).json(leaveRequests);
    } catch (error: any) {
      console.error('Error fetching leave requests:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

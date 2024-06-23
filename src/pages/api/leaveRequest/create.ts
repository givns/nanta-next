// pages/api/leaveRequest/create.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { notifyAdmins } from '../../../utils/sendLeaveRequestNotification';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST' || req.method === 'PUT') {
    const {
      lineUserId,
      leaveType,
      leaveFormat,
      reason,
      startDate,
      endDate,
      fullDayCount,
      resubmitted,
      originalRequestId,
    } = req.body;

    try {
      // Find the user by lineUserId
      const user = await prisma.user.findUnique({ where: { lineUserId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Create the new leave request
      const newLeaveRequest = await prisma.leaveRequest.create({
        data: {
          userId: user.id,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: 'Pending',
          fullDayCount,
          resubmitted: resubmitted || false,
          originalRequestId: originalRequestId || null,
        },
      });

      // Notify admins about the new leave request
      await notifyAdmins(newLeaveRequest);

      // Send a success response
      res.status(201).json({
        success: true,
        message: 'Leave request created successfully',
        data: newLeaveRequest,
      });
    } catch (error: any) {
      console.error('Error creating leave request:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['POST', 'PUT']);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}

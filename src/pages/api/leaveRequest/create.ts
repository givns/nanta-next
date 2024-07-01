// pages/api/leaveRequest/create.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { notifyAdmins } from '../../../utils/sendLeaveRequestNotification';
import { getOriginalLeaveRequest } from '../../../utils/leaveRequestHandlers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
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
      const user = await prisma.user.findUnique({ where: { lineUserId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let leaveRequestData;

      if (resubmitted && originalRequestId) {
        // Handling resubmission
        const originalRequest =
          await getOriginalLeaveRequest(originalRequestId);
        if (!originalRequest) {
          return res
            .status(404)
            .json({ error: 'Original leave request not found' });
        }

        leaveRequestData = {
          ...originalRequest,
          userId: user.id,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          fullDayCount,
          status: 'Pending',
          resubmitted: true,
          originalRequestId,
          id: undefined, // Let Prisma generate a new ID
          createdAt: undefined, // Let Prisma set the current timestamp
          updatedAt: undefined, // Let Prisma set the current timestamp
        };
      } else {
        // Handling new submission
        leaveRequestData = {
          userId: user.id,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: 'Pending',
          fullDayCount,
          resubmitted: false,
        };
      }

      const newLeaveRequest = await prisma.leaveRequest.create({
        data: leaveRequestData,
      });

      await notifyAdmins(newLeaveRequest);

      res.status(201).json({
        success: true,
        message: resubmitted
          ? 'Leave request resubmitted successfully'
          : 'Leave request created successfully',
        data: newLeaveRequest,
      });
    } catch (error: any) {
      console.error('Error creating/resubmitting leave request:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}

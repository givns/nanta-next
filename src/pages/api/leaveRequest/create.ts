import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { LeaveRequest } from '@prisma/client';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    lineUserId,
    leaveType,
    leaveFormat,
    reason,
    startDate,
    endDate,
    fullDayCount,
    useOvertimeHours,
    resubmitted,
    originalRequestId,
  } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) throw new Error('User not found');

    let leaveRequestData: any = {
      userId: user.id,
      leaveType,
      leaveFormat,
      reason,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'Pending',
      fullDayCount,
      useOvertimeHours,
      resubmitted,
    };

    if (resubmitted && originalRequestId) {
      const originalRequest = await prisma.leaveRequest.findUnique({
        where: { id: originalRequestId },
      });
      if (originalRequest) {
        leaveRequestData = {
          ...originalRequest,
          ...leaveRequestData,
          originalRequestId,
          id: undefined,
          createdAt: undefined,
          updatedAt: undefined,
        };
      }
    }

    const newLeaveRequest = await prisma.leaveRequest.create({
      data: leaveRequestData,
    });

    // Optionally: Notify admins
    // await notifyAdmins(newLeaveRequest);

    return res.status(201).json(newLeaveRequest);
  } catch (error) {
    console.error('Error creating leave request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

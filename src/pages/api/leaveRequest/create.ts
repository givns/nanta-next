import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    userId,
    leaveType,
    leaveFormat,
    reason,
    startDate,
    endDate,
    fullDayCount,
    resubmitted,
    originalRequestId,
  } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    let leaveRequestData: any = {
      userId,
      leaveType,
      leaveFormat,
      reason,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'Pending',
      fullDayCount,
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

    return res.status(201).json(newLeaveRequest);
  } catch (error) {
    console.error('Error creating leave request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

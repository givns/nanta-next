import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        sickLeaveBalance: true,
        businessLeaveBalance: true,
        annualLeaveBalance: true,
        overtimeLeaveBalance: true,
        leaveRequests: {
          where: {
            status: 'Approved',
          },
          select: {
            leaveType: true,
            fullDayCount: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const usedLeave = {
      sickLeave: 0,
      businessLeave: 0,
      annualLeave: 0,
      overtimeLeave: 0,
    };

    user.leaveRequests.forEach((request) => {
      switch (request.leaveType) {
        case 'ลาป่วย':
          usedLeave.sickLeave += request.fullDayCount;
          break;
        case 'ลากิจ':
          usedLeave.businessLeave += request.fullDayCount;
          break;
        case 'ลาพักร้อน':
          usedLeave.annualLeave += request.fullDayCount;
          break;
        case 'ลาโดยใช้ชั่วโมง OT':
          usedLeave.overtimeLeave += request.fullDayCount;
          break;
      }
    });

    const leaveBalance = {
      sickLeave: user.sickLeaveBalance - usedLeave.sickLeave,
      businessLeave: user.businessLeaveBalance - usedLeave.businessLeave,
      annualLeave: user.annualLeaveBalance - usedLeave.annualLeave,
      overtimeLeave: user.overtimeLeaveBalance - usedLeave.overtimeLeave,
    };

    const totalLeaveDays =
      leaveBalance.sickLeave +
      leaveBalance.businessLeave +
      leaveBalance.annualLeave +
      leaveBalance.overtimeLeave;

    res.status(200).json({
      ...leaveBalance,
      totalLeaveDays,
    });
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    res.status(500).json({ message: 'Error fetching leave balance' });
  }
}

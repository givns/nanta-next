import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

interface LeaveBalanceData {
  sickLeave: number;
  businessLeave: number;
  annualLeave: number;
  overtimeLeave: number;
  totalLeaveDays: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing user ID' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        leaveRequests: {
          where: { status: 'Approved' },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const leaveBalance = calculateLeaveBalance(user);
    return res.status(200).json(leaveBalance);
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function calculateLeaveBalance(user: any): LeaveBalanceData {
  const usedLeave = {
    sickLeave: 0,
    businessLeave: 0,
    annualLeave: 0,
    overtimeLeave: 0,
  };

  user.leaveRequests.forEach((request: any) => {
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

  const balance = {
    sickLeave: user.sickLeaveBalance - usedLeave.sickLeave,
    businessLeave: user.businessLeaveBalance - usedLeave.businessLeave,
    annualLeave: user.annualLeaveBalance - usedLeave.annualLeave,
    overtimeLeave: user.overtimeLeaveBalance - usedLeave.overtimeLeave,
    totalLeaveDays: 0,
  };

  balance.totalLeaveDays =
    balance.sickLeave +
    balance.businessLeave +
    balance.annualLeave +
    balance.overtimeLeave;

  return balance;
}

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
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        leaveRequests: {
          where: {
            status: 'APPROVED',
            startDate: {
              gte: new Date(new Date().getFullYear(), 0, 1), // Start of current year
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const leaveBalance = calculateLeaveBalance(user);

    res.status(200).json(leaveBalance);
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    res.status(500).json({ message: 'Error fetching leave balance' });
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
      case 'sick':
        usedLeave.sickLeave += request.fullDayCount;
        break;
      case 'business':
        usedLeave.businessLeave += request.fullDayCount;
        break;
      case 'annual':
        usedLeave.annualLeave += request.fullDayCount;
        break;
      case 'overtime':
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
    balance.sickLeave + balance.businessLeave + balance.annualLeave;

  return balance;
}

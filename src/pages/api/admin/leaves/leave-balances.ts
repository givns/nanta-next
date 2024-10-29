// pages/api/admin/leave-balances.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // First verify if the requesting user is an admin
    const admin = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true },
    });

    if (!admin || !['Admin', 'SuperAdmin'].includes(admin.role)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Fetch all employees with their leave balances
    const employees = await prisma.user.findMany({
      select: {
        employeeId: true,
        name: true,
        departmentName: true,
        sickLeaveBalance: true,
        businessLeaveBalance: true,
        annualLeaveBalance: true,
        leaveRequests: {
          where: {
            status: 'approved',
            endDate: {
              gte: new Date(new Date().getFullYear(), 0, 1), // From start of current year
            },
          },
          select: {
            leaveType: true,
            fullDayCount: true,
          },
        },
      },
    });

    // Transform data to include used leave calculations
    const leaveBalances = employees.map((emp) => {
      const usedSickLeave = emp.leaveRequests
        .filter((req) => req.leaveType === 'sick')
        .reduce((sum, req) => sum + req.fullDayCount, 0);

      const usedAnnualLeave = emp.leaveRequests
        .filter((req) => req.leaveType === 'annual')
        .reduce((sum, req) => sum + req.fullDayCount, 0);

      const usedBusinessLeave = emp.leaveRequests
        .filter((req) => req.leaveType === 'business')
        .reduce((sum, req) => sum + req.fullDayCount, 0);

      return {
        employeeId: emp.employeeId,
        employeeName: emp.name,
        department: emp.departmentName,
        sickLeave: {
          total: emp.sickLeaveBalance,
          used: usedSickLeave,
          remaining: emp.sickLeaveBalance - usedSickLeave,
        },
        annualLeave: {
          total: emp.annualLeaveBalance,
          used: usedAnnualLeave,
          remaining: emp.annualLeaveBalance - usedAnnualLeave,
        },
        businessLeave: {
          total: emp.businessLeaveBalance,
          used: usedBusinessLeave,
          remaining: emp.businessLeaveBalance - usedBusinessLeave,
        },
      };
    });

    res.status(200).json(leaveBalances);
  } catch (error) {
    console.error('Error fetching leave balances:', error);
    res.status(500).json({ message: 'Failed to fetch leave balances' });
  }
}

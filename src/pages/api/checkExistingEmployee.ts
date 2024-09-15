// pages/api/checkExistingEmployee.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.body;

  try {
    console.log('Checking employee with ID:', employeeId);

    const user = await prisma.user.findUnique({
      where: { employeeId },
    });

    console.log('User found:', user);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: 'Employee not found' });
    }

    // Return user info without sensitive data
    const userInfo = {
      employeeId: user.employeeId,
      name: user.name,
      nickname: user.nickname,
      departmentName: user.departmentName,
      role: user.role,
      company: user.company,
      employeeType: user.employeeType,
      isGovernmentRegistered: user.isGovernmentRegistered,
      shiftCode: user.shiftCode,
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
    };

    res.status(200).json({ success: true, user: userInfo });
  } catch (error: any) {
    console.error('Error checking existing employee:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}

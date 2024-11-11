// pages/api/checkExistingEmployee.ts
import type { NextApiRequest, NextApiResponse } from 'next';
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
  const lineUserId = req.headers['x-line-userid'] as string;

  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Check if employeeId is already registered with a LINE account
    const existingUser = await prisma.user.findFirst({
      where: {
        employeeId,
        lineUserId: { not: null },
        isRegistrationComplete: 'Yes',
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Employee is already registered with a LINE account',
      });
    }

    // Find or update user
    const user = await prisma.user.upsert({
      where: { employeeId },
      update: {
        lineUserId,
        isRegistrationComplete: 'No',
      },
      create: {
        employeeId,
        lineUserId,
        name: '',
        departmentName: '',
        role: 'General',
        isRegistrationComplete: 'No',
      },
      include: { department: true },
    });

    // Return user info
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

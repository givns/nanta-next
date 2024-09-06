import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../types/enum';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, nickname, department, role, lineUserId, profilePictureUrl } =
    req.body;

  try {
    // Generate a new employee ID
    const latestUser = await prisma.user.findFirst({
      orderBy: { employeeId: 'desc' },
    });
    const latestId = latestUser ? parseInt(latestUser.employeeId.slice(3)) : 0;
    const newEmployeeId = `EMP${(latestId + 1).toString().padStart(4, '0')}`;

    const newUser = await prisma.user.create({
      data: {
        employeeId: newEmployeeId,
        name,
        nickname,
        department: { connect: { name: department } },
        role: role as UserRole,
        lineUserId,
        profilePictureUrl,
        sickLeaveBalance: 30,
        businessLeaveBalance: 3,
        annualLeaveBalance: 6,
        overtimeLeaveBalance: 0,
        assignedShift: { connect: { shiftCode: 'DEFAULT' } },
      },
      include: { department: true },
    });

    // Return user info without sensitive data
    const userInfo = {
      employeeId: newUser.employeeId,
      name: newUser.name,
      nickname: newUser.nickname,
      department: newUser.department.name,
      role: newUser.role,
      sickLeaveBalance: newUser.sickLeaveBalance,
      businessLeaveBalance: newUser.businessLeaveBalance,
      annualLeaveBalance: newUser.annualLeaveBalance,
    };

    res.status(201).json({ success: true, user: userInfo });
  } catch (error) {
    console.error('Error registering new employee:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

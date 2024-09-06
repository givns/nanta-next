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

  const { employeeId, lineUserId, profilePictureUrl } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: 'Employee not found' });
    }

    // Update the user with LINE info
    await prisma.user.update({
      where: { employeeId },
      data: { lineUserId, profilePictureUrl },
    });

    // Return user info without sensitive data
    const userInfo = {
      employeeId: user.employeeId,
      name: user.name,
      nickname: user.nickname,
      department: user.department.name,
      role: user.role,
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
    };

    res.status(200).json({ success: true, user: userInfo });
  } catch (error) {
    console.error('Error checking existing employee:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

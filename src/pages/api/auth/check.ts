// pages/api/auth/check.ts
import type { NextApiRequest, NextApiResponse } from 'next';
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
  const requiredRoles = req.headers['x-required-roles'] as string;

  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Find user by LINE ID
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: {
        id: true,
        employeeId: true,
        name: true,
        role: true,
        departmentId: true,
        departmentName: true,
        nickname: true,
        company: true,
        employeeType: true,
        isGovernmentRegistered: true,
        workStartDate: true,
        profilePictureUrl: true,
        shiftCode: true,
        isRegistrationComplete: true,
        assignedShift: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            workDays: true,
          },
        },
      },
    });

    // If no user found with this LINE ID
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    // Check if registration is complete
    if (user.isRegistrationComplete === 'No') {
      return res.status(200).json({
        user,
        isAuthorized: false,
        registrationStatus: {
          isComplete: false,
          message: 'Registration incomplete',
        },
      });
    }

    // Check authorization if roles are required
    let isAuthorized = true;
    if (requiredRoles) {
      const requiredRolesArray = requiredRoles.split(',');
      isAuthorized = requiredRolesArray.includes(user.role);
    }

    // Successful response with full user data
    return res.status(200).json({
      user,
      isAuthorized,
      registrationStatus: {
        isComplete: true,
      },
    });
  } catch (error) {
    console.error('Error checking authorization:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

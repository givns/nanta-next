// pages/api/adjust-shift.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { lineUserId, targetType, adjustments, date, reason } = req.body;

    // Validate input
    if (!lineUserId || !targetType || !adjustments || !date || !reason) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Find the user making the request
    const requestingUser = await prisma.user.findUnique({
      where: { lineUserId: lineUserId },
    });

    if (!requestingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the user has permission to make adjustments
    if (
      requestingUser.role.toUpperCase() !== 'ADMIN' &&
      requestingUser.role.toUpperCase() !== 'SUPERADMIN'
    ) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const shiftAdjustments = [];

    if (targetType === 'department') {
      for (const adjustment of adjustments) {
        const { department, shiftId } = adjustment;

        // Find all users in the department
        const users = await prisma.user.findMany({
          where: { departmentId: department },
        });

        // Create shift adjustment for each user
        for (const user of users) {
          const shiftAdjustment = await prisma.shiftAdjustmentRequest.create({
            data: {
              userId: user.id,
              requestedShiftId: shiftId,
              date: new Date(date),
              reason: reason,
              status: 'approved', // Auto-approve for admins
            },
          });
          shiftAdjustments.push(shiftAdjustment);
        }
      }
    } else if (targetType === 'individual') {
      for (const adjustment of adjustments) {
        const { employeeId, shiftId } = adjustment;

        // Find the user by employeeId
        const user = await prisma.user.findUnique({
          where: { employeeId: employeeId },
        });

        if (!user) {
          return res
            .status(404)
            .json({ message: `User with employee ID ${employeeId} not found` });
        }

        // Create shift adjustment for the user
        const shiftAdjustment = await prisma.shiftAdjustmentRequest.create({
          data: {
            userId: user.id,
            requestedShiftId: shiftId,
            date: new Date(date),
            reason: reason,
            status: 'approved', // Auto-approve for admins
          },
        });
        shiftAdjustments.push(shiftAdjustment);
      }
    } else {
      return res.status(400).json({ message: 'Invalid target type' });
    }

    res.status(200).json({
      message: 'Shift adjustments created successfully',
      adjustments: shiftAdjustments,
    });
  } catch (error: any) {
    console.error('Error creating shift adjustments:', error);
    res.status(500).json({
      message: 'Error creating shift adjustments',
      error: error.message,
    });
  }
}

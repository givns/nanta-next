// pages/api/adjust-shift.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { ShiftManagementService } from '../../services/ShiftManagementService';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '@/types/enum';

const prisma = new PrismaClient();
const shiftManagementService = new ShiftManagementService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { lineUserId, targetType, targetId, newShiftId, date, reason } =
      req.body;

    if (!lineUserId) {
      return res.status(400).json({ message: 'LINE User ID is required' });
    }

    // Fetch user details from your database
    const user = await prisma.user.findUnique({
      where: { lineUserId: lineUserId },
      select: { id: true, role: true, employeeId: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let adjustments;

    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN) {
      // Admin-initiated adjustment
      adjustments = await shiftManagementService.adminCreateShiftAdjustment(
        user.id,
        targetType,
        targetId,
        newShiftId,
        new Date(date),
        reason,
      );
    } else {
      // Regular user request
      const adjustment = await shiftManagementService.requestShiftAdjustment(
        user.employeeId,
        newShiftId,
        new Date(date),
        reason,
      );
      adjustments = [adjustment];
    }

    res.status(200).json({
      message: 'Shift adjustment request processed successfully',
      adjustments,
    });
  } catch (error: any) {
    console.error('Error processing shift adjustment:', error);
    res.status(500).json({
      message: 'Error processing shift adjustment',
      error: error.message,
    });
  }
}

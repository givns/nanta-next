// pages/api/adjust-shift.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AdminShiftService } from '../../services/AdminShiftService';

const prisma = new PrismaClient();
const adminShiftService = new AdminShiftService();

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

    if (targetType === 'department') {
      const users = await prisma.user.findMany({
        where: { departmentId: targetId },
      });
      for (const user of users) {
        await adminShiftService.createShiftAdjustment(
          user.id,
          newShiftId,
          new Date(date),
          reason,
        );
      }
    } else {
      await adminShiftService.createShiftAdjustment(
        targetId,
        newShiftId,
        new Date(date),
        reason,
      );
    }

    res
      .status(200)
      .json({ message: 'Shift adjustment(s) applied successfully' });
  } catch (error: any) {
    console.error('Error applying shift adjustment(s):', error);
    res.status(500).json({
      message: 'Error applying shift adjustment(s)',
      error: error.message,
    });
  }
}

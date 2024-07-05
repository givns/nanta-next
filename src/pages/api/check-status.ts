// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '../../services/ShiftManagementService';
import prisma from '../../lib/prisma';

const attendanceService = new AttendanceService();
const shiftManagementService = new ShiftManagementService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });
    if (!user) throw new Error('User not found');

    const status =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    const shiftAdjustment =
      await shiftManagementService.getShiftAdjustmentForDate(
        user.id,
        new Date(),
      );

    res.status(200).json({
      ...status,
      user: {
        ...user,
        assignedShift: user.assignedShift,
      },
      shiftAdjustment: shiftAdjustment,
    });
  } catch (error: any) {
    console.error('Error checking status:', error);
    res
      .status(500)
      .json({ message: 'Error checking status', error: error.message });
  }
}

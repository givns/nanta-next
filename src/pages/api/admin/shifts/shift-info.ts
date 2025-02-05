// pages/api/overtime/shift-info.ts

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

  const { lineUserId, date } = req.query;

  if (!lineUserId || !date) {
    return res
      .status(400)
      .json({ message: 'LINE User ID and date are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId: lineUserId as string },
      include: {
        department: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId: user.employeeId,
        date: new Date(date as string),
        status: 'approved',
      },
      include: { requestedShift: true },
    });

    const effectiveShift = shiftAdjustment?.requestedShift;

    if (!effectiveShift) {
      return res.status(404).json({ message: 'No shift found for the user' });
    }

    // Ensure startTime and endTime are in HH:MM format
    const formatTimeToHHMM = (time: string) => {
      const [hours, minutes] = time.split(':');
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    };

    res.status(200).json({
      name: user.name,
      nickname: user.nickname,
      employeeId: user.employeeId,
      department: user.department?.name ?? 'Unassigned',
      shift: {
        name: effectiveShift.name,
        startTime: formatTimeToHHMM(effectiveShift.startTime),
        endTime: formatTimeToHHMM(effectiveShift.endTime),
      },
    });
  } catch (error) {
    console.error('Error fetching overtime shift info:', error);
    res.status(500).json({ message: 'Error fetching overtime shift info' });
  }
}

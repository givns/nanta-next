// pages/api/getShiftDetails.ts

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

  const { shiftCode } = req.query;

  if (!shiftCode || typeof shiftCode !== 'string') {
    return res.status(400).json({ message: 'Invalid shiftCode' });
  }

  try {
    const shift = await prisma.shift.findUnique({
      where: { shiftCode: shiftCode },
    });

    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    // Convert workDays to an array of numbers
    const formattedShift = {
      ...shift,
      workDays: shift.workDays.map((day) => Number(day)),
    };

    res.status(200).json(formattedShift);
  } catch (error) {
    console.error('Error fetching shift details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

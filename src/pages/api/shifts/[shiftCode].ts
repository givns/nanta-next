// pages/api/shifts/[shiftCode].ts

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

  if (typeof shiftCode !== 'string') {
    return res.status(400).json({ error: 'Invalid shiftCode' });
  }

  try {
    const shift = await prisma.shift.findUnique({
      where: { shiftCode },
    });

    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    res.status(200).json(shift);
  } catch (error) {
    console.error('Error fetching shift:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

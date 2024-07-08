import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Shift ID is required' });
  }

  try {
    const shift = await prisma.shift.findUnique({
      where: { id },
    });

    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    res.status(200).json(shift);
  } catch (error) {
    console.error('Error fetching shift:', error);
    res.status(500).json({ message: 'Error fetching shift' });
  }
}

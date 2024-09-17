import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { ShiftManagementService } from '../../services/ShiftManagementService';

const prisma = new PrismaClient();
const shiftManagementService = new ShiftManagementService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, date } = req.query;

  if (
    !employeeId ||
    typeof employeeId !== 'string' ||
    !date ||
    typeof date !== 'string'
  ) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }

  try {
    const effectiveShift = await shiftManagementService.getEffectiveShift(
      employeeId,
      new Date(date),
    );
    res.status(200).json(effectiveShift);
  } catch (error) {
    console.error('Error getting effective shift:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

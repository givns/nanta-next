// pages/api/shifts/check-outside.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import prisma from '../../../lib/prisma';

const shiftManagementService = new ShiftManagementService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  if (typeof employeeId !== 'string') {
    return res.status(400).json({ error: 'Invalid employeeId' });
  }

  try {
    const isOutsideShift =
      await shiftManagementService.isOutsideShift(employeeId);
    res.status(200).json({ isOutsideShift });
  } catch (error) {
    console.error('Error checking if outside shift:', error);
    res.status(500).json({ error: 'Failed to check if outside shift' });
  }
}

// pages/api/shifts/check-outside.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import { formatDateTime, getCurrentTime } from '@/utils/dateUtils';

const prisma = new PrismaClient();
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
    const shiftStatus =
      await shiftManagementService.getEffectiveShiftAndStatus(employeeId);
    console.log(
      `Current time: ${formatDateTime(getCurrentTime(), 'yyyy-MM-dd HH:mm:ss')}`,
    );
    console.log(`Shift data: ${JSON.stringify(shiftStatus)}`); // Fixed variable name from shiftData to shiftStatus
    res.status(200).json(shiftStatus);
  } catch (error) {
    console.error('Error checking shift status:', error);
    res.status(500).json({ error: 'Failed to check shift status' });
  }
}

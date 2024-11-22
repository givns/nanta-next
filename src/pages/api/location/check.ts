// pages/api/location/check.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ShiftManagementService } from '../../../services/ShiftManagementService/ShiftManagementService';
import { PrismaClient } from '@prisma/client';
import { HolidayService } from '@/services/HolidayService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const shiftManagementService = new ShiftManagementService(
  prisma,
  holidayService,
);
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lat, lng } = req.body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Invalid latitude or longitude' });
  }

  try {
    const premise = shiftManagementService.isWithinPremises(lat, lng);

    if (premise) {
      res.status(200).json({
        inPremises: true,
        address: premise.name,
      });
    } else {
      res.status(200).json({
        inPremises: false,
        address: 'นอกพื้นที่',
      });
    }
  } catch (error) {
    console.error('Error checking location:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

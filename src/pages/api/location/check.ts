// pages/api/location/check.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import prisma from '../../../lib/prisma';

const shiftManagementService = new ShiftManagementService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lat, lng } = req.body;

  try {
    const address = await shiftManagementService.getAddressFromCoordinates(
      lat,
      lng,
    );
    const inPremises = await shiftManagementService.isWithinPremises(lat, lng);
    console.log('Address:', address);

    res.status(200).json({ address, inPremises });
  } catch (error) {
    console.error('Error checking location:', error);
    res.status(500).json({ error: 'Failed to check location' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const {
        userId,
        role,
        photo,
        timestamp,
        latitude,
        longitude,
        address,
        checkpointName,
      } = req.body;

      if (!userId || !role || !timestamp) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const checkInData: any = {
        userId,
        type: 'IN',
        createdAt: new Date(timestamp),
      };

      if (role === 'DRIVER') {
        if (!latitude || !longitude || !address) {
          return res
            .status(400)
            .json({ error: 'Missing location data for driver check-in' });
        }
        checkInData.latitude = latitude;
        checkInData.longitude = longitude;
        checkInData.address = address;
        checkInData.checkpointName = checkpointName;
      } else if (role === 'GENERAL') {
        if (!photo) {
          return res
            .status(400)
            .json({ error: 'Missing photo for general employee check-in' });
        }
        checkInData.photo = photo;
      } else {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const checkIn = await prisma.checkIn.create({
        data: checkInData,
      });

      res.status(201).json(checkIn);
    } catch (error) {
      console.error('Check-in failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

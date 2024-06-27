import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';
import { CheckInType } from '@prisma/client';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const {
        userId,
        type,
        photo,
        latitude,
        longitude,
        address,
        checkpointName,
      } = req.body;

      if (!userId || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const checkInData: any = {
        userId,
        type: type as CheckInType,
        createdAt: new Date(),
      };

      if (type === 'IN' || type === 'CHECKPOINT') {
        if (!latitude || !longitude || !address) {
          return res
            .status(400)
            .json({ error: 'Missing location data for check-in' });
        }
        checkInData.latitude = latitude;
        checkInData.longitude = longitude;
        checkInData.address = address;
        checkInData.checkpointName = checkpointName;
      }

      if (photo) {
        checkInData.photo = photo;
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

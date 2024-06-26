import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { userId, location, address, checkpointName } = req.body;

      const checkpoint = await prisma.checkIn.create({
        data: {
          userId,
          latitude: location.lat,
          longitude: location.lng,
          address,
          type: 'CHECKPOINT',
          checkpointName,
        },
      });

      res.status(200).json({ success: true, data: checkpoint });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: 'Failed to add checkpoint' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

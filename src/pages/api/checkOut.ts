import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { userId, location, address } = req.body;

      const checkOut = await prisma.checkIn.create({
        data: {
          userId,
          latitude: location.lat,
          longitude: location.lng,
          address,
          type: 'OUT',
        },
      });

      res.status(200).json({ success: true, data: checkOut });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to check out' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

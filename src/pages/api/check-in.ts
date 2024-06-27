import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { lineUserId, photo, type, latitude, longitude, address } = req.body;

    try {
      const user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const checkIn = await prisma.checkIn.create({
        data: {
          userId: user.id,
          photo,
          type,
          latitude,
          longitude,
          address,
        },
      });

      res.status(200).json({ message: 'Check-in successful', data: checkIn });
    } catch (error) {
      console.error('Error during check-in:', error);
      res.status(500).json({ error: 'Error during check-in' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

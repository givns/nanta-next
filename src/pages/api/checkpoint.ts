import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { userId, jobTitle, timestamp, location, address } = req.body;

      const checkpoint = await prisma.checkPoint.create({
        data: {
          user: { connect: { id: userId } },
          jobTitle,
          timestamp: new Date(timestamp),
          latitude: location.lat,
          longitude: location.lng,
          address,
        },
      });

      res.status(200).json(checkpoint);
    } catch (error) {
      console.error('Error creating checkpoint:', error);
      res.status(500).json({ error: 'Error creating checkpoint' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

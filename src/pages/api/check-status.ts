import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const { userId } = req.query;

    try {
      const latestCheckIn = await prisma.checkIn.findFirst({
        where: { userId: userId as string },
        orderBy: { createdAt: 'desc' },
      });

      const isCheckedIn = latestCheckIn && !latestCheckIn.checkOutTime;

      res.status(200).json({ isCheckedIn });
    } catch (error) {
      console.error('Error checking status:', error);
      res.status(500).json({ error: 'Error checking status' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

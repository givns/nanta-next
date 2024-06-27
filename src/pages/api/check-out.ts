import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { lineUserId } = req.body;

    try {
      const user = await prisma.user.findUnique({
        where: { lineUserId },
        include: { checkIns: { orderBy: { timestamp: 'desc' }, take: 1 } },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const latestCheckIn = user.checkIns[0];

      if (!latestCheckIn || latestCheckIn.checkOutTime) {
        return res.status(400).json({ error: 'No active check-in found' });
      }

      const updatedCheckIn = await prisma.checkIn.update({
        where: { id: latestCheckIn.id },
        data: { checkOutTime: new Date() },
      });

      res
        .status(200)
        .json({ message: 'Check-out successful', data: updatedCheckIn });
    } catch (error) {
      console.error('Error during check-out:', error);
      res.status(500).json({ error: 'Error during check-out' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

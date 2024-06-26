import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      const { id } = req.query;

      if (typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid tracking session ID' });
      }

      const trackingSession = await prisma.trackingSession.findUnique({
        where: { id },
        include: { locations: true },
      });

      if (!trackingSession) {
        return res.status(404).json({ error: 'Tracking session not found' });
      }

      const totalDistance =
        await prisma.trackingSession.calculateTotalDistance(id);

      res.status(200).json({
        ...trackingSession,
        totalDistance,
      });
    } catch (error) {
      console.error('Error fetching tracking session:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

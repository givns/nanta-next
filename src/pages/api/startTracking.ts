import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { userId } = req.body;

      const trackingSession = await prisma.trackingSession.create({
        data: {
          userId,
          startTime: new Date(),
        },
      });

      res
        .status(200)
        .json({ success: true, trackingSessionId: trackingSession.id });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: 'Failed to start tracking session' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { trackingSessionId } = req.body;

      await prisma.trackingSession.update({
        where: { id: trackingSessionId },
        data: { endTime: new Date() },
      });

      res
        .status(200)
        .json({ success: true, message: 'Tracking session ended' });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: 'Failed to stop tracking session' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

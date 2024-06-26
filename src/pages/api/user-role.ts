import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const { lineUserId } = req.query;

    if (!lineUserId || typeof lineUserId !== 'string') {
      return res.status(400).json({ error: 'Invalid LINE User ID' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { lineUserId: lineUserId },
        select: { role: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.status(200).json({ role: user.role });
    } catch (error) {
      console.error('Error fetching user role:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

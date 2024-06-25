import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { lineUserId, latitude, longitude } = req.body;

      // Find the user by lineUserId
      const user = await prisma.user.findUnique({ where: { lineUserId } });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: 'User not found' });
      }

      // Create a GPS log entry
      const gpsLog = await prisma.gpsLog.create({
        data: {
          userId: user.id,
          latitude,
          longitude,
        },
      });

      // Return the created GPS log entry
      res.status(201).json({ success: true, data: gpsLog });
    } catch (error) {
      console.error('Error logging GPS data:', error);
      res
        .status(500)
        .json({ success: false, message: 'Error logging GPS data' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

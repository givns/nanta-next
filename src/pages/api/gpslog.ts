// pages/api/gpsLog.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { lineUserId, latitude, longitude } = req.body;

      const user = await prisma.user.findUnique({ where: { lineUserId } });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: 'User not found' });
      }

      const gpsLog = await prisma.gpsLog.create({
        // Changed from gPSLog to gpsLog
        data: {
          userId: user.id,
          latitude,
          longitude,
        },
      });

      res.status(201).json({ success: true, data: gpsLog });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: 'Error logging GPS data' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const {
        lineUserId,
        latitude,
        longitude,
        location,
        method,
        type,
        checkpointName,
      } = req.body;

      // Find the user
      const user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: 'User not found' });
      }

      // Create the check-in record
      const checkIn = await prisma.checkIn.create({
        data: {
          userId: user.id,
          latitude,
          longitude,
          location,
          method,
          type,
          checkpointName,
        },
      });

      res.status(201).json({ success: true, data: checkIn });
    } catch (error: any) {
      console.error('Error creating check-in:', error);
      res
        .status(500)
        .json({
          success: false,
          message: 'Error creating check-in',
          error: error.message,
        });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

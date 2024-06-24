import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const {
        userId,
        latitude,
        longitude,
        location,
        method,
        type,
        checkpointName,
      } = req.body;

      const checkIn = await prisma.checkIn.create({
        data: {
          userId,
          latitude,
          longitude,
          location,
          method,
          type,
          checkpointName,
        },
      });

      res.status(201).json({ success: true, data: checkIn });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: 'Error creating check-in record' });
    }
  } else if (req.method === 'GET') {
    // ... (keep existing GET logic)
    try {
      const { userId } = req.query;

      const checkIns = await prisma.checkIn.findMany({
        where: { userId: userId as string },
        orderBy: { timestamp: 'desc' },
        take: 10, // Limit to last 10 records
      });

      res.status(200).json({ success: true, data: checkIns });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: 'Error fetching check-in records' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

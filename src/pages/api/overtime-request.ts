import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { userId, date, hours, reason } = req.body;

    try {
      const overtimeRequest = await prisma.overtimeRequest.create({
        data: {
          userId,
          date,
          hours,
          reason,
          status: 'pending', // Default status
        },
      });

      res.status(201).json({ success: true, data: overtimeRequest });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

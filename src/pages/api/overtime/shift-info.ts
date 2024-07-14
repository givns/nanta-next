import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const { lineUserId, date } = req.query;

    if (!lineUserId || !date) {
      return res
        .status(400)
        .json({ message: 'LINE User ID and date are required' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { lineUserId: lineUserId as string },
        include: {
          department: true,
          assignedShift: true,
        },
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
        where: {
          userId: user.id,
          date: new Date(date as string),
          status: 'approved',
        },
        include: { requestedShift: true },
      });

      const effectiveShift =
        shiftAdjustment?.requestedShift || user.assignedShift;

      res.status(200).json({
        name: user.name,
        nickname: user.nickname,
        employeeId: user.employeeId,
        department: user.department.name,
        shift: effectiveShift,
      });
    } catch (error) {
      console.error('Error fetching overtime shift info:', error);
      res.status(500).json({ message: 'Error fetching overtime shift info' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

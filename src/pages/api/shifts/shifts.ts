// pages/api/shifts/shifts.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const { action, shiftId, userId, lineUserId, date } = req.query;

    try {
      switch (action) {
        case 'all': {
          const shifts = await prisma.shift.findMany();
          res.status(200).json(shifts);
          break;
        }

        case 'single': {
          if (!shiftId) {
            res.status(400).json({ message: 'Shift ID is required' });
            return;
          }
          const shift = await prisma.shift.findUnique({
            where: { id: shiftId as string },
          });
          if (!shift) {
            res.status(404).json({ message: 'Shift not found' });
            return;
          }
          res.status(200).json(shift);
          break;
        }

        case 'user': {
          if (!userId && !lineUserId) {
            res
              .status(400)
              .json({ message: 'User ID or LINE User ID is required' });
            return;
          }
          let user;
          if (userId) {
            user = await prisma.user.findUnique({
              where: { id: userId as string },
              include: { assignedShift: true },
            });
          } else {
            user = await prisma.user.findUnique({
              where: { lineUserId: lineUserId as string },
              include: { assignedShift: true },
            });
          }
          if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
          }
          res.status(200).json(user.assignedShift);
          break;
        }

        case 'adjustment': {
          if ((!userId && !lineUserId) || !date) {
            res
              .status(400)
              .json({
                message: 'User ID or LINE User ID, and date are required',
              });
            return;
          }
          let adjustmentUser;
          if (userId) {
            adjustmentUser = await prisma.user.findUnique({
              where: { id: userId as string },
            });
          } else {
            adjustmentUser = await prisma.user.findUnique({
              where: { lineUserId: lineUserId as string },
            });
          }
          if (!adjustmentUser) {
            res.status(404).json({ message: 'User not found' });
            return;
          }
          const adjustment = await prisma.shiftAdjustmentRequest.findFirst({
            where: {
              userId: adjustmentUser.id,
              date: new Date(date as string),
              status: 'approved',
            },
            include: { requestedShift: true },
          });
          res.status(200).json(adjustment ? adjustment.requestedShift : null);
          break;
        }

        default: {
          res.status(400).json({ message: 'Invalid action' });
        }
      }
    } catch (error) {
      console.error('Error processing shift request:', error);
      res.status(500).json({ message: 'Error processing shift request' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// pages/api/shifts/shifts.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      let shifts = await prisma.shift.findMany();

      if (shifts.length === 0) {
        const shiftData = [
          {
            shiftCode: 'SHIFT100',
            name: 'กะตี 5',
            startTime: '05:00',
            endTime: '14:00',
            workDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
          },
          {
            shiftCode: 'SHIFT101',
            name: 'กะเช้า 6 โมง',
            startTime: '06:00',
            endTime: '15:00',
            workDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
          },
          {
            shiftCode: 'SHIFT102',
            name: 'กะเช้า 7 โมง',
            startTime: '07:00',
            endTime: '16:00',
            workDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
          },
          {
            shiftCode: 'SHIFT103',
            name: 'ช่วงเวลาปกติ',
            startTime: '08:00',
            endTime: '17:00',
            workDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
          },
          {
            shiftCode: 'SHIFT104',
            name: 'กะบ่าย 2 โมง',
            startTime: '14:00',
            endTime: '23:00',
            workDays: [0, 1, 2, 3, 4, 5], // Sunday to Friday
          },
        ];

        shifts = await Promise.all(
          shiftData.map((shift) =>
            prisma.shift.upsert({
              where: { shiftCode: shift.shiftCode },
              update: shift,
              create: shift,
            }),
          ),
        );
      }

      res.status(200).json(shifts);
    } catch (error) {
      console.error('Error fetching shifts:', error);
      res.status(500).json({ error: 'Error fetching shifts' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

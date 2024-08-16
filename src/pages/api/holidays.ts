import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { subDays } from 'date-fns';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { year, shiftType } = req.query;

  if (!year || typeof year !== 'string') {
    return res.status(400).json({ error: 'Invalid year parameter' });
  }

  try {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);

    let holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    if (shiftType === 'shift104') {
      holidays = holidays.map((holiday) => ({
        ...holiday,
        date: subDays(holiday.date, 1),
        name: `Shift 104 - ${holiday.name}`,
      }));
    }

    res.status(200).json(holidays);
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: 'Error fetching holidays' });
  }
}

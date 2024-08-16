import type { NextApiRequest, NextApiResponse } from 'next';
import { HolidayService } from '../../services/HolidayService';
import { Holiday } from '@prisma/client';

const holidayService = new HolidayService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Holiday[]>,
) {
  const { year, shiftType } = req.query;

  if (!year || typeof year !== 'string') {
    return res.status(400).json([]);
  }

  try {
    const holidays = await holidayService.getHolidaysForYear(
      parseInt(year),
      shiftType === 'shift104' ? 'shift104' : 'regular',
    );

    console.log(`Fetched ${holidays.length} holidays for year ${year}`);
    res.status(200).json(holidays);
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json([]);
  }
}

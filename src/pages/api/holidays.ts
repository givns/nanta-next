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
    const yearNumber = parseInt(year);
    console.log(`API: Syncing holidays for year ${yearNumber}`);
    await holidayService.syncHolidays(yearNumber);

    console.log(`API: Fetching holidays for year ${yearNumber}`);
    const holidays = await holidayService.getHolidaysForYear(
      yearNumber,
      shiftType === 'shift104' ? 'shift104' : 'regular',
    );

    console.log(
      `API: Fetched ${holidays.length} holidays for year ${yearNumber}`,
    );
    res.status(200).json(holidays);
  } catch (error) {
    console.error('API: Error fetching holidays:', error);
    res.status(500).json([]);
  }
}

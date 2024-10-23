//api/holidays.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { HolidayService } from '../../services/HolidayService';
import { Holiday, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Holiday[] | { error: string }>,
) {
  const { year, shiftType } = req.query;

  if (!year || typeof year !== 'string') {
    return res.status(400).json({ error: 'Invalid year parameter' });
  }

  try {
    const yearNumber = parseInt(year);
    console.log(`API: Fetching holidays for year ${yearNumber}`);
    const holidays = await holidayService.getHolidaysForYear(
      yearNumber,
      shiftType === 'shift104' ? 'shift104' : 'regular',
    );

    console.log(
      `API: Fetched ${holidays.length} holidays for year ${yearNumber}`,
    );

    const fallbackHolidays2024: any[] = []; // Declare and initialize fallbackHolidays2024 as an empty array
    if (holidays.length === 0) {
      console.log('No holidays found, using fallback');
      // Use fallback holidays if no holidays were found
      const fallbackHolidays =
        yearNumber === 2024
          ? fallbackHolidays2024.map((h) => ({
              ...h,
              date: new Date(h.date),
              id: '', // Add an empty id or generate a unique one
              types: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          : [];

      res.status(200).json(fallbackHolidays);
    } else {
      res.status(200).json(holidays);
    }
  } catch (error) {
    console.error('API: Error fetching holidays:', error);
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    res.status(500).json({ error: errorMessage });
  }
}

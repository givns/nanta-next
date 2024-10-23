import type { NextApiRequest, NextApiResponse } from 'next';
import { HolidayService } from '../../services/HolidayService';
import { Holiday, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);

// Schema for validating new holiday data
const CreateHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  localName: z.string().min(1),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Holiday | Holiday[] | { error: string }>,
) {
  if (req.method === 'GET') {
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

      const fallbackHolidays2024: any[] = [];
      if (holidays.length === 0) {
        console.log('No holidays found, using fallback');
        const fallbackHolidays =
          yearNumber === 2024
            ? fallbackHolidays2024.map((h) => ({
                ...h,
                date: new Date(h.date),
                id: '',
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
  } else if (req.method === 'POST') {
    try {
      // Validate the request body
      const validatedData = CreateHolidaySchema.parse(req.body);

      // Create the holiday
      const newHoliday = await prisma.holiday.create({
        data: {
          date: new Date(validatedData.date),
          name: validatedData.name,
          localName: validatedData.localName,
          types: [], // Default empty array for types
        },
      });

      console.log('Created new holiday:', newHoliday);
      return res.status(201).json(newHoliday);
    } catch (error) {
      console.error('Error creating holiday:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid input data',
          ...error.errors, // Remove the 'details' property
        });
      }
      return res.status(500).json({ error: 'Failed to create holiday' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}

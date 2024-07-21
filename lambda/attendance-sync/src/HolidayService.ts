import { PrismaClient, Holiday } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

export class HolidayService {
  async syncHolidays(year: number): Promise<void> {
    try {
      const response = await axios.get(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/TH`,
      );
      const holidays = response.data;

      for (const holiday of holidays) {
        await prisma.holiday.upsert({
          where: {
            date_date: {
              date: new Date(holiday.date),
              name: holiday.name,
            },
          },
          update: {
            localName: holiday.localName,
            countryCode: holiday.countryCode,
            fixed: holiday.fixed,
            global: holiday.global,
            counties: holiday.counties ? holiday.counties.join(',') : null,
            launchYear: holiday.launchYear,
            types: holiday.types, // Directly assign the array
          },
          create: {
            date: new Date(holiday.date),
            name: holiday.name,
            localName: holiday.localName,
            countryCode: holiday.countryCode,
            fixed: holiday.fixed,
            global: holiday.global,
            counties: holiday.counties ? holiday.counties.join(',') : null,
            launchYear: holiday.launchYear,
            types: holiday.types, // Directly assign the array
          },
        });
      }

      console.log(`Synced holidays for year ${year}`);
    } catch (error) {
      console.error('Error syncing holidays:', error);
      throw error;
    }
  }

  async getHolidays(startDate: Date, endDate: Date): Promise<Holiday[]> {
    return prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }
}

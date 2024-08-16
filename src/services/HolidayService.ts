import { PrismaClient, Holiday } from '@prisma/client';
import axios from 'axios';
import { parseISO, format, isSameDay, subDays } from 'date-fns';

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
    const holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    console.log(
      `Fetched ${holidays.length} holidays between ${startDate} and ${endDate}`,
    );
    return holidays;
  }

  async isHoliday(date: Date, isShift104: boolean = false): Promise<boolean> {
    const checkDate = isShift104 ? subDays(date, 1) : date;
    const holiday = await prisma.holiday.findFirst({
      where: {
        date: checkDate,
      },
    });

    return !!holiday;
  }

  async isWorkingDay(userId: string, date: Date): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user || !user.assignedShift) {
      throw new Error('User or assigned shift not found');
    }

    const dayOfWeek = date.getDay();
    const isRegularWorkday = user.assignedShift.workDays.includes(dayOfWeek);

    if (user.assignedShift.shiftCode === 'SHIFT104') {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      return isRegularWorkday && !(await this.isHoliday(nextDay));
    } else {
      return isRegularWorkday && !(await this.isHoliday(date));
    }
  }
}

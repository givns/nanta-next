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
        const existingHoliday = await prisma.holiday.findFirst({
          where: {
            date: new Date(holiday.date),
            name: holiday.name,
          },
        });

        if (existingHoliday) {
          await prisma.holiday.update({
            where: { id: existingHoliday.id },
            data: {
              localName: holiday.localName,
              types: holiday.types,
            },
          });
        } else {
          await prisma.holiday.create({
            data: {
              date: new Date(holiday.date),
              name: holiday.name,
              localName: holiday.localName,
              types: holiday.types,
            },
          });
        }
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

    if (holidays.length === 0) {
      const year = startDate.getFullYear();
      await this.syncHolidays(year);
      return this.getHolidays(startDate, endDate);
    }

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

    if (!holiday) {
      const year = date.getFullYear();
      await this.syncHolidays(year);
      return this.isHoliday(date, isShift104);
    }

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

  async getHolidaysForYear(
    year: number,
    shiftType: 'regular' | 'shift104',
  ): Promise<Holiday[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    let holidays = await this.getHolidays(startDate, endDate);

    if (shiftType === 'shift104') {
      holidays = holidays.map((holiday) => ({
        ...holiday,
        date: subDays(holiday.date, 1),
        name: `Shift 104 - ${holiday.name}`,
      }));
    }

    return holidays;
  }
}

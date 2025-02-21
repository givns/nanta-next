import axios from 'axios';
import { isSameDay, subDays, addDays, startOfDay, endOfDay } from 'date-fns';
import type { PrismaClient } from '@prisma/client';
import { PrismaHoliday } from '@/types/attendance';

interface HolidayInput {
  date: string | Date;
  name: string;
  localName: string;
  types?: string[];
}

const fallbackHolidays2024 = [
  { date: '2024-01-01', name: "New Year's Day", localName: 'วันขึ้นปีใหม่' },
  { date: '2024-02-10', name: 'Makha Bucha', localName: 'วันมาฆบูชา' },
  { date: '2024-04-06', name: 'Chakri Memorial Day', localName: 'วันจักรี' },
  { date: '2024-04-13', name: 'Songkran Festival', localName: 'วันสงกรานต์' },
  { date: '2024-04-14', name: 'Songkran Festival', localName: 'วันสงกรานต์' },
  { date: '2024-04-15', name: 'Songkran Festival', localName: 'วันสงกรานต์' },
  { date: '2024-05-01', name: 'Labour Day', localName: 'วันแรงงาน' },
  { date: '2024-05-04', name: 'Coronation Day', localName: 'วันฉัตรมงคล' },
  {
    date: '2024-06-03',
    name: "Queen Suthida's Birthday",
    localName:
      'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าสุทิดา พัชรสุธาพิมลลักษณ พระบรมราชินี',
  },
  {
    date: '2024-07-28',
    name: "King Vajiralongkorn's Birthday",
    localName: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว',
  },
  { date: '2024-08-12', name: "Mother's Day", localName: 'วันแม่แห่งชาติ' },
  {
    date: '2024-10-13',
    name: 'Passing of King Bhumibol',
    localName:
      'วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศร มหาภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร',
  },
  {
    date: '2024-10-23',
    name: 'Chulalongkorn Memorial Day',
    localName: 'วันปิยมหาราช',
  },
  {
    date: '2024-12-05',
    name: "King Bhumibol's Birthday",
    localName:
      'วันคล้ายวันพระบรมราชสมภพของพระบาทสมเด็จพระบรมชนกาธิเบศร มหาภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร',
  },
  { date: '2024-12-10', name: 'Constitution Day', localName: 'วันรัฐธรรมนูญ' },
  { date: '2024-12-31', name: "New Year's Eve", localName: 'วันสิ้นปี' },
];

export class HolidayService {
  private syncInProgress: { [key: number]: boolean } = {};
  private holidayCache: { [key: number]: PrismaHoliday[] } = {};
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getHolidays(startDate: Date, endDate: Date): Promise<PrismaHoliday[]> {
    try {
      const normalizedStartDate = startOfDay(startDate);
      const normalizedEndDate = endOfDay(endDate);

      return await this.prisma.holiday.findMany({
        where: {
          date: {
            gte: normalizedStartDate,
            lte: normalizedEndDate,
          },
        },
      });
    } catch (error) {
      console.error('Error fetching holidays:', error);
      return [];
    }
  }

  async isHoliday(
    date: Date,
    holidays?: PrismaHoliday[],
    is104?: boolean,
  ): Promise<boolean> {
    try {
      const normalizedDate = startOfDay(date);

      // Use provided holidays if available to avoid additional queries
      const holidayList =
        holidays || (await this.getHolidays(normalizedDate, normalizedDate));

      if (is104) {
        return holidayList.some((holiday) =>
          isSameDay(holiday.date, normalizedDate),
        );
      }

      return holidayList.some((holiday) =>
        isSameDay(holiday.date, normalizedDate),
      );
    } catch (error) {
      console.error('Error checking holiday:', error);
      return false;
    }
  }

  public async syncHolidays(year: number): Promise<void> {
    if (this.syncInProgress[year]) {
      console.log(`Sync already in progress for year ${year}`);
      return;
    }

    this.syncInProgress[year] = true;

    try {
      // Check existing holidays first
      const existingHolidays = await this.prisma.holiday.findMany({
        where: {
          date: {
            gte: new Date(`${year}-01-01`),
            lte: new Date(`${year}-12-31`),
          },
        },
      });

      if (existingHolidays.length > 0) {
        console.log(
          `Found ${existingHolidays.length} existing holidays for ${year}`,
        );
        this.holidayCache[year] = existingHolidays;
        return;
      }

      // Try to get holidays from API
      console.log(`Fetching holidays for year ${year}`);
      try {
        const response = await axios.get(
          `https://date.nager.at/api/v3/PublicHolidays/${year}/TH`,
        );

        if (Array.isArray(response.data) && response.data.length > 0) {
          await this.saveHolidays(response.data, year);
          return;
        }
      } catch (error) {
        console.error('Error fetching from API, using fallback:', error);
      }

      // Use fallback holidays if API fails or returns no data
      if (year === 2024) {
        console.log('Using 2024 fallback holidays');
        await this.saveHolidays(fallbackHolidays2024, year);
      } else {
        console.log(`No fallback holidays available for ${year}`);
      }
    } catch (error) {
      console.error(`Error syncing holidays for ${year}:`, error);
    } finally {
      this.syncInProgress[year] = false;
    }
  }

  private async saveHolidays(holidays: HolidayInput[], year: number) {
    try {
      console.log(`Attempting to save ${holidays.length} holidays for ${year}`);

      const formattedHolidays = holidays.map((holiday) => ({
        date: new Date(holiday.date),
        name: holiday.name,
        localName: holiday.localName,
        types: holiday.types || ['Public'],
      }));

      return await this.prisma.$transaction(async (tx) => {
        const created = [];
        for (const holiday of formattedHolidays) {
          try {
            const existing = await tx.holiday.findFirst({
              where: {
                date: holiday.date,
              },
            });

            if (!existing) {
              const created_holiday = await tx.holiday.create({
                data: holiday,
              });
              created.push(created_holiday);
            }
          } catch (error) {
            console.warn(`Skipping duplicate holiday for date ${holiday.date}`);
          }
        }

        console.log(
          `Successfully created ${created.length} holidays for ${year}`,
        );

        // Update cache only after successful creation
        if (created.length > 0) {
          this.holidayCache[year] = await tx.holiday.findMany({
            where: {
              date: {
                gte: new Date(`${year}-01-01`),
                lte: new Date(`${year}-12-31`),
              },
            },
          });
        }

        return created;
      });
    } catch (error) {
      console.error('Error saving holidays:', error);
      throw error;
    }
  }

  async createHoliday(data: {
    date: Date;
    name: string;
    localName: string;
  }): Promise<PrismaHoliday> {
    console.log('Creating new holiday:', data);

    return await this.prisma.$transaction(async (tx) => {
      // Check for existing holiday first
      const existing = await tx.holiday.findFirst({
        where: {
          date: data.date,
        },
      });

      if (existing) {
        throw new Error(`Holiday already exists for date ${data.date}`);
      }

      return tx.holiday.create({
        data: {
          date: data.date,
          name: data.name,
          localName: data.localName,
        },
      });
    });
  }

  async updateHoliday(
    id: string,
    data: Partial<{
      date: Date;
      name: string;
      localName: string;
    }>,
  ): Promise<PrismaHoliday> {
    return this.prisma.holiday.update({
      where: { id },
      data,
    });
  }

  async isWorkingDay(userId: string, date: Date): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user || !user.assignedShift) {
      throw new Error('User or assigned shift not found');
    }

    const dayOfWeek = date.getDay();
    const isRegularWorkday = user.assignedShift.workDays.includes(dayOfWeek);

    const year = date.getFullYear();
    if (!this.holidayCache[year]) {
      await this.syncHolidays(year);
    }

    const isShift104 = user.assignedShift.shiftCode === 'SHIFT104';
    const checkDate = isShift104 ? addDays(date, 1) : date;

    return (
      isRegularWorkday &&
      !this.isHoliday(checkDate, this.holidayCache[year], isShift104)
    );
  }

  async getHolidaysForYear(
    year: number,
    shiftType: 'regular' | 'shift104',
  ): Promise<PrismaHoliday[]> {
    if (!this.holidayCache[year]) {
      await this.syncHolidays(year);
    }

    let holidays = this.holidayCache[year] || [];

    if (shiftType === 'shift104') {
      holidays = holidays.map((holiday) => ({
        ...holiday,
        date: subDays(holiday.date, 1),
        name: `Shift 104 - ${holiday.name}`,
      }));
    }

    console.log(
      `Retrieved ${holidays.length} holidays${shiftType === 'shift104' ? ' (adjusted for Shift 104)' : ''}`,
    );
    return holidays;
  }
}

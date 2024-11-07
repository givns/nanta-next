import axios from 'axios';
import { isSameDay, subDays, addDays, startOfDay, endOfDay } from 'date-fns';
import type { PrismaClient, Prisma, Holiday } from '@prisma/client';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

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
  private holidayCache: { [key: number]: Holiday[] } = {};
  private prisma: PrismaClient | TransactionClient;

  constructor(prisma: PrismaClient | TransactionClient) {
    this.prisma = prisma;
  }
  async getHolidays(startDate: Date, endDate: Date): Promise<Holiday[]> {
    try {
      console.log(`Fetching holidays between ${startDate} and ${endDate}`);

      // Ensure dates are normalized
      const normalizedStartDate = startOfDay(startDate);
      const normalizedEndDate = endOfDay(endDate);

      // Fetch holidays from database
      const holidays = await this.prisma.holiday.findMany({
        where: {
          date: {
            gte: normalizedStartDate,
            lte: normalizedEndDate,
          },
        },
      });

      // If no holidays found, try to sync
      if (holidays.length === 0) {
        const year = startDate.getFullYear();
        await this.syncHolidays(year);

        // Try fetching again after sync
        const syncedHolidays = await this.prisma.holiday.findMany({
          where: {
            date: {
              gte: normalizedStartDate,
              lte: normalizedEndDate,
            },
          },
        });

        console.log(`Fetched ${syncedHolidays.length} holidays after sync`);
        return syncedHolidays;
      }

      console.log(
        `Fetched ${holidays.length} holidays between ${startDate} and ${endDate}`,
      );
      return holidays;
    } catch (error) {
      console.error('Error fetching holidays:', error);
      return [];
    }
  }

  async isHoliday(
    date: Date,
    holidays?: Holiday[],
    is104?: boolean,
  ): Promise<boolean> {
    try {
      const normalizedDate = startOfDay(date);

      // Use provided holidays or fetch them
      const holidayList =
        holidays || (await this.getHolidays(normalizedDate, normalizedDate));

      // For SHIFT104, weekends are not holidays
      if (is104) {
        return holidayList.some((holiday) =>
          isSameDay(holiday.date, normalizedDate),
        );
      }

      // Check if the date exists in holidays
      return holidayList.some((holiday) =>
        isSameDay(holiday.date, normalizedDate),
      );
    } catch (error) {
      console.error('Error checking holiday:', error);
      return false;
    }
  }

  private async syncHolidays(year: number): Promise<void> {
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

      // Handle both regular PrismaClient and transaction client
      if ('$transaction' in this.prisma) {
        // Using regular PrismaClient
        return await this.prisma.$transaction(async (tx: TransactionClient) => {
          return this.createHolidaysInTransaction(tx, formattedHolidays, year);
        });
      } else {
        // Already in a transaction
        return await this.createHolidaysInTransaction(
          this.prisma,
          formattedHolidays,
          year,
        );
      }
    } catch (error) {
      console.error('Error saving holidays:', error);
      throw error;
    }
  }

  private async createHolidaysInTransaction(
    client: PrismaClient | TransactionClient,
    holidays: Array<{
      date: Date;
      name: string;
      localName: string;
      types: string[];
    }>,
    year: number,
  ) {
    const created = [];

    for (const holiday of holidays) {
      try {
        // Check if holiday already exists
        const existing = await client.holiday.findFirst({
          where: {
            date: holiday.date,
          },
        });

        if (!existing) {
          const created_holiday = await client.holiday.create({
            data: holiday,
          });
          created.push(created_holiday);
        }
      } catch (err) {
        console.warn(`Skipping duplicate holiday for date ${holiday.date}`);
      }
    }

    console.log(`Successfully created ${created.length} holidays for ${year}`);

    // Update cache only after successful creation
    if (created.length > 0) {
      this.holidayCache[year] = await client.holiday.findMany({
        where: {
          date: {
            gte: new Date(`${year}-01-01`),
            lte: new Date(`${year}-12-31`),
          },
        },
      });
    }

    return created;
  }

  async createHoliday(data: {
    date: Date;
    name: string;
    localName: string;
  }): Promise<Holiday> {
    console.log('Creating new holiday:', data);

    if ('$transaction' in this.prisma) {
      return await this.prisma.$transaction(async (tx: TransactionClient) => {
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
            types: ['Public'],
          },
        });
      });
    } else {
      // Already in a transaction
      const existing = await this.prisma.holiday.findFirst({
        where: {
          date: data.date,
        },
      });

      if (existing) {
        throw new Error(`Holiday already exists for date ${data.date}`);
      }

      return this.prisma.holiday.create({
        data: {
          date: data.date,
          name: data.name,
          localName: data.localName,
          types: ['Public'],
        },
      });
    }
  }

  async updateHoliday(
    id: string,
    data: Partial<{
      date: Date;
      name: string;
      localName: string;
      types: string[];
    }>,
  ): Promise<Holiday> {
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
}

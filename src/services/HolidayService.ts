import { PrismaClient, Holiday } from '@prisma/client';
import axios from 'axios';
import { parseISO, format, isSameDay, subDays } from 'date-fns';

const prisma = new PrismaClient();

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

  async syncHolidays(year: number): Promise<void> {
    if (this.syncInProgress[year]) {
      console.log(`Sync already in progress for year ${year}`);
      return;
    }

    this.syncInProgress[year] = true;

    try {
      console.log(`Fetching holidays for year ${year}`);
      const response = await axios.get(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/TH`,
      );
      console.log('Raw API response:', JSON.stringify(response.data));

      let holidays;
      if (Array.isArray(response.data) && response.data.length > 0) {
        holidays = response.data;
      } else {
        console.log('Using fallback holidays');
        holidays = year === 2024 ? fallbackHolidays2024 : [];
      }

      console.log(`Processing ${holidays.length} holidays`);

      const existingHolidays = await prisma.holiday.findMany({
        where: {
          date: {
            gte: new Date(`${year}-01-01`),
            lte: new Date(`${year}-12-31`),
          },
        },
      });

      const holidaysToCreate = holidays.filter(
        (apiHoliday) =>
          !existingHolidays.some(
            (dbHoliday) =>
              dbHoliday.date.toISOString().split('T')[0] === apiHoliday.date &&
              dbHoliday.name === apiHoliday.name,
          ),
      );

      if (holidaysToCreate.length > 0) {
        console.log(`Creating ${holidaysToCreate.length} new holidays`);
        await prisma.holiday.createMany({
          data: holidaysToCreate.map((holiday) => ({
            date: new Date(holiday.date),
            name: holiday.name,
            localName: holiday.localName,
            types: holiday.types || [],
          })),
        });
      } else {
        console.log('No new holidays to create');
      }

      console.log(`Synced holidays for year ${year}`);
    } catch (error) {
      console.error('Error syncing holidays:', error);
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', error.response?.data);
      }
    } finally {
      this.syncInProgress[year] = false;
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

  async getHolidaysForYear(
    year: number,
    shiftType: 'regular' | 'shift104',
  ): Promise<Holiday[]> {
    console.log(`Getting holidays for year ${year}, shiftType: ${shiftType}`);
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    console.log(`Fetching holidays between ${startDate} and ${endDate}`);
    let holidays = await this.getHolidays(startDate, endDate);

    console.log(`Found ${holidays.length} holidays initially`);
    if (holidays.length === 0) {
      console.log(`No holidays found for year ${year}, syncing now`);
      await this.syncHolidays(year);
      console.log(`Sync complete, fetching holidays again`);
      holidays = await this.getHolidays(startDate, endDate);
      console.log(`Found ${holidays.length} holidays after sync`);
    }

    if (shiftType === 'shift104') {
      console.log(`Adjusting holidays for Shift 104`);
      holidays = holidays.map((holiday) => ({
        ...holiday,
        date: subDays(holiday.date, 1),
        name: `Shift 104 - ${holiday.name}`,
      }));
    }

    console.log(`Returning ${holidays.length} holidays`);
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
}

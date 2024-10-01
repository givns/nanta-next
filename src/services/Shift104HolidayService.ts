// services/Shift104HolidayService.ts

import { PrismaClient } from '@prisma/client';
import { NotificationService } from './NotificationService';
import { subDays, format, parseISO } from 'date-fns';

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

export class Shift104HolidayService {
  async adjustHolidaysForShift104(year: number): Promise<void> {
    const holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        },
      },
    });

    for (const holiday of holidays) {
      const shiftedDate = subDays(holiday.date, 1);

      await prisma.holiday.create({
        data: {
          ...holiday,
          date: shiftedDate,
          name: `Shift 104 - ${holiday.name}`,
        },
      });
    }
  }

  async isShift104Holiday(date: Date): Promise<boolean> {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const formattedNextDay = format(nextDay, 'yyyy-MM-dd');

    const holiday = await prisma.holiday.findFirst({
      where: {
        date: {
          equals: parseISO(formattedNextDay),
        },
        name: { startsWith: 'Shift 104 - ' },
      },
    });

    return !!holiday;
  }
}

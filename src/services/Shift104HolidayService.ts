// services/Shift104HolidayService.ts

import { PrismaClient, Holiday } from '@prisma/client';
import { NotificationService } from './NotificationService';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export class Shift104HolidayService {
  async adjustHolidaysForShift104(year: number): Promise<void> {
    const holidays = await prisma.holiday.findMany({
      where: {
        date: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
      },
    });

    for (const holiday of holidays) {
      const shiftedDate = new Date(holiday.date);
      shiftedDate.setDate(shiftedDate.getDate() - 1);

      await prisma.holiday.create({
        data: {
          ...holiday,
          date: shiftedDate,
          name: `Shift 104 - ${holiday.name}`,
        },
      });
    }

    // Notify admin to confirm holiday placements
    await this.notifyAdminForConfirmation(year);
  }

  private async notifyAdminForConfirmation(year: number): Promise<void> {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    });

    for (const admin of admins) {
      await notificationService.sendNotification(
        admin.id,
        `Please confirm the placement of Shift 104 holidays for year ${year}.`,
      );
    }
  }

  async notifyShift104Workers(holidayDate: Date): Promise<void> {
    const shift104Workers = await prisma.user.findMany({
      where: { assignedShift: { shiftCode: 'SHIFT104' } },
    });

    const shiftedDate = new Date(holidayDate);
    shiftedDate.setDate(shiftedDate.getDate() - 1);

    for (const worker of shift104Workers) {
      await notificationService.sendNotification(
        worker.id,
        `Your holiday for ${holidayDate.toDateString()} has been shifted to ${shiftedDate.toDateString()}.`,
      );
    }
  }
}

import { PrismaClient, NoWorkDay } from '@prisma/client';

const prisma = new PrismaClient();

export class NoWorkDayService {
  async getNoWorkDays(): Promise<NoWorkDay[]> {
    return prisma.noWorkDay.findMany({
      orderBy: { date: 'asc' },
    });
  }

  async addNoWorkDay(date: Date, reason?: string): Promise<NoWorkDay> {
    return prisma.noWorkDay.create({
      data: {
        date,
        reason,
      },
    });
  }

  async updateNoWorkDay(
    id: string,
    date: Date,
    reason?: string,
  ): Promise<NoWorkDay> {
    return prisma.noWorkDay.update({
      where: { id },
      data: {
        date,
        reason,
      },
    });
  }

  async deleteNoWorkDay(id: string): Promise<void> {
    await prisma.noWorkDay.delete({
      where: { id },
    });
  }
}

import { PrismaClient, NoWorkDay } from '@prisma/client';
import { endOfDay, startOfDay } from 'date-fns';

const prisma = new PrismaClient();

export class NoWorkDayService {
  prisma: any;
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

  async isNoWorkDay(date: Date, userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const noWorkDay = await this.prisma.noWorkDay.findFirst({
      where: {
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        OR: [
          { affectedDepartments: { has: user.department.id } },
          { affectedDepartments: { isEmpty: true } },
        ],
      },
    });

    return !!noWorkDay;
  }

  async deleteNoWorkDay(id: string): Promise<void> {
    await prisma.noWorkDay.delete({
      where: { id },
    });
  }
}

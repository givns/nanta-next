import { PrismaClient, Holiday } from '@prisma/client';
import { HolidayService } from './HolidayService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);

export class WorkdayCalculationService {
  async calculateWorkingDays(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, assignedShift: true },
    });

    if (!user || !user.assignedShift || !user.assignedShift.workDays) {
      throw new Error('User or assigned shift not found or invalid');
    }

    const holidays = await holidayService.getHolidays(startDate, endDate);

    const departmentDaysOff = await prisma.departmentDayOff.findMany({
      where: {
        departmentId: user.departmentId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    let workingDays = 0;
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      if (
        this.isWorkDay(
          currentDate,
          user.assignedShift,
          holidays,
          departmentDaysOff,
        )
      ) {
        workingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDays;
  }

  private isWorkDay(
    date: Date,
    shift: { workDays: number[] },
    holidays: Holiday[],
    departmentDaysOff: { date: Date }[],
  ): boolean {
    // Check if it's a holiday
    if (holidays.some((holiday) => holiday.date.getTime() === date.getTime())) {
      return false;
    }

    // Check if it's a department day off
    if (
      departmentDaysOff.some(
        (dayOff) => dayOff.date.getTime() === date.getTime(),
      )
    ) {
      return false;
    }

    // Check if it's a work day according to the shift
    // Assuming workDays is an array of day numbers (0 = Sunday, 1 = Monday, etc.)
    return shift.workDays.includes(date.getDay());
  }

  async getCurrentPayrollPeriod(): Promise<{ startDate: Date; endDate: Date }> {
    const today = new Date();
    let startDate: Date, endDate: Date;

    if (today.getDate() <= 25) {
      // Current month's period
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 26);
      endDate = new Date(today.getFullYear(), today.getMonth(), 25);
    } else {
      // Next month's period
      startDate = new Date(today.getFullYear(), today.getMonth(), 26);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 25);
    }

    return { startDate, endDate };
  }
}

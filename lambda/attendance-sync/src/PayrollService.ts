import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PayrollService {
  async calculatePayroll(userId: string, startDate: Date, endDate: Date) {
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        userId,
        checkInTime: { gte: startDate },
        checkOutTime: { lte: endDate },
      },
    });

    let totalHours = 0;
    for (const record of attendanceRecords) {
      if (record.checkOutTime) {
        const hours =
          (record.checkOutTime.getTime() -
            (record.checkInTime?.getTime() ?? 0)) /
          (1000 * 60 * 60);
        totalHours += hours;
      }
    }

    // Implement your payroll calculation logic here
    const hourlyRate = 10; // Replace with actual hourly rate
    const grossPay = totalHours * hourlyRate;

    return {
      userId,
      startDate,
      endDate,
      totalHours,
      grossPay,
    };
  }
}

export const payrollService = new PayrollService();

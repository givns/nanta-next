import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PayrollService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async calculatePayroll(employeeId: string, startDate: Date, endDate: Date) {
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        employeeId,
        regularCheckInTime: { gte: startDate },
        regularCheckOutTime: { lte: endDate },
      },
    });

    let totalHours = 0;
    for (const record of attendanceRecords) {
      if (record.regularCheckOutTime) {
        const hours =
          (record.regularCheckOutTime.getTime() -
            (record.regularCheckInTime?.getTime() ?? 0)) /
          (1000 * 60 * 60);
        totalHours += hours;
      }
    }

    // Implement your payroll calculation logic here
    const hourlyRate = 10; // Replace with actual hourly rate
    const grossPay = totalHours * hourlyRate;

    return {
      employeeId,
      startDate,
      endDate,
      totalHours,
      grossPay,
    };
  }
  async createPayrollPeriod(startDate: Date, endDate: Date) {
    return this.prisma.payrollPeriod.create({
      data: {
        startDate,
        endDate,
      },
    });
  }

  async getPayrollPeriod(id: string) {
    return this.prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        attendancePayrollPeriods: {
          include: {
            attendance: true,
          },
        },
        timeEntryPayrollPeriods: {
          include: {
            timeEntry: true,
          },
        },
      },
    });
  }
}

export const payrollService = new PayrollService(prisma);

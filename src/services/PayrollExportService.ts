// services/PayrollExportService.ts

import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

const prisma = new PrismaClient();

export class PayrollExportService {
  async generatePayrollExport(startDate: Date, endDate: Date): Promise<Buffer> {
    const users = await prisma.user.findMany({
      include: {
        attendances: {
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
        leaveRequests: {
          where: {
            startDate: {
              gte: startDate,
              lte: endDate,
            },
            status: 'APPROVED',
          },
        },
        overtimeRequests: {
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
            status: 'APPROVED',
          },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payroll');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Total Work Days', key: 'workDays', width: 15 },
      { header: 'Sick Leave', key: 'sickLeave', width: 10 },
      { header: 'Business Leave', key: 'businessLeave', width: 15 },
      { header: 'Annual Leave', key: 'annualLeave', width: 15 },
      { header: 'Leave with Overtime', key: 'overtimeLeave', width: 20 },
      { header: 'Leave without Pay', key: 'unpaidLeave', width: 20 },
      { header: 'Total Overtime Hours', key: 'overtimeHours', width: 20 },
    ];

    users.forEach((user) => {
      const workDays = user.attendances.length;
      const sickLeave = user.leaveRequests.filter(
        (lr) => lr.leaveType === 'SICK',
      ).length;
      const businessLeave = user.leaveRequests.filter(
        (lr) => lr.leaveType === 'BUSINESS',
      ).length;
      const annualLeave = user.leaveRequests.filter(
        (lr) => lr.leaveType === 'ANNUAL',
      ).length;
      const overtimeLeave = user.leaveRequests.filter(
        (lr) => lr.leaveType === 'OVERTIME',
      ).length;
      const unpaidLeave = user.leaveRequests.filter(
        (lr) => lr.leaveType === 'UNPAID',
      ).length;
      const overtimeHours = user.overtimeRequests.reduce((total, or) => {
        const start = new Date(`${or.date.toDateString()} ${or.startTime}`);
        const end = new Date(`${or.date.toDateString()} ${or.endTime}`);
        const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60); // Convert to hours
        return total + duration;
      }, 0);

      worksheet.addRow({
        name: user.name,
        employeeId: user.employeeId,
        workDays,
        sickLeave,
        businessLeave,
        annualLeave,
        overtimeLeave,
        unpaidLeave,
        overtimeHours,
      });
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer;
  }
}

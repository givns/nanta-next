// src/lib/processAttendance.ts

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData } from '../types/user';
import { parseISO, addDays } from 'date-fns';
import { logMessage } from '../utils/inMemoryLogger';
import { leaveServiceServer } from '../services/LeaveServiceServer';
import { format, parse, subMonths, addMonths } from 'date-fns';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();

const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
  leaveServiceServer,
);

function calculatePeriodDates(payrollPeriod: string): {
  start: string;
  end: string;
} {
  if (payrollPeriod === 'current') {
    const now = new Date();
    const currentDay = now.getDate();
    let startDate: Date, endDate: Date;

    if (currentDay < 26) {
      // Current period started last month
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 26);
      endDate = new Date(now.getFullYear(), now.getMonth(), 25);
    } else {
      // Current period starts this month
      startDate = new Date(now.getFullYear(), now.getMonth(), 26);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 25);
    }

    return {
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd'),
    };
  }

  const [month, year] = payrollPeriod.split('-');
  const periodDate = parse(`${month} ${year}`, 'MMMM yyyy', new Date());
  const startDate = subMonths(periodDate, 1);
  startDate.setDate(26);
  const endDate = addMonths(startDate, 1);
  endDate.setDate(25);

  return {
    start: format(startDate, 'yyyy-MM-dd'),
    end: format(endDate, 'yyyy-MM-dd'),
  };
}

export async function processAttendance(job: Job): Promise<any> {
  logMessage(`Starting attendance processing for job: ${job.id}`);
  logMessage(`Job data: ${JSON.stringify(job.data)}`);

  const { employeeId, payrollPeriod } = job.data;

  if (!employeeId) {
    throw new Error('Employee ID is required');
  }

  if (!payrollPeriod) {
    throw new Error('Payroll period is required');
  }

  try {
    const { start: startDate, end: endDate } =
      calculatePeriodDates(payrollPeriod);
    const queryEndDate = addDays(parseISO(endDate), 1); // Add one day to include the full last day

    logMessage(
      `Processing attendance for employee: ${employeeId} for period: ${payrollPeriod} (${startDate} to ${endDate})`,
    );

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: {
        assignedShift: true,
        department: true,
        potentialOvertimes: true,
      },
    });

    if (!user) {
      throw new Error(`User not found for employeeId: ${employeeId}`);
    }

    const userData: UserData = attendanceService.convertToUserData(user);

    const attendanceRecords = await attendanceService.getAttendanceRecords(
      employeeId,
      new Date(startDate),
      queryEndDate,
    );

    const holidays = await attendanceService.getHolidaysForDateRange(
      new Date(startDate),
      new Date(endDate),
    );

    const processedAttendance = await attendanceService.processAttendanceData(
      attendanceRecords,
      userData,
      new Date(startDate),
      new Date(endDate),
      holidays,
    );

    const summary = await attendanceService.calculateSummary(
      processedAttendance.processedAttendance,
      new Date(startDate),
      new Date(endDate),
    );

    const result = {
      success: true,
      summary,
      userData,
      processedAttendance,
      payrollPeriod: {
        period: payrollPeriod,
        start: startDate,
        end: endDate,
      },
    };

    await prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        periodStart: new Date(startDate),
        periodEnd: new Date(endDate),
        totalWorkingDays: summary.totalWorkingDays,
        totalPresent: summary.totalPresent,
        totalAbsent: summary.totalAbsent,
        totalOvertimeHours: summary.totalOvertimeHours,
        totalRegularHours: summary.totalRegularHours,
        processedData: JSON.stringify(result),
      },
    });

    logMessage(`Attendance processing completed for job: ${job.id}`);
    return result;
  } catch (error: any) {
    logMessage(`Error processing attendance: ${error.message}`);
    console.error('Error processing attendance:', error);
    throw error;
  }
}

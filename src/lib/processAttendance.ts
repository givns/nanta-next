import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData } from '../types/user';
import {
  parseISO,
  addDays,
  isValid,
  format,
  parse,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { logMessage } from '../utils/inMemoryLogger';
import { leaveServiceServer } from '../services/LeaveServiceServer';

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
  logMessage(`Calculating period dates for payroll period: ${payrollPeriod}`);

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
  if (!month || !year) {
    throw new Error(`Invalid payroll period format: ${payrollPeriod}`);
  }

  const monthIndex = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ].indexOf(month.toLowerCase());

  if (monthIndex === -1) {
    throw new Error(`Invalid month in payroll period: ${month}`);
  }

  const yearNumber = parseInt(year, 10);
  if (isNaN(yearNumber)) {
    throw new Error(`Invalid year in payroll period: ${year}`);
  }

  const date = new Date(yearNumber, monthIndex);
  if (!isValid(date)) {
    throw new Error(
      `Invalid date created from payroll period: ${payrollPeriod}`,
    );
  }

  const start = startOfMonth(date);
  const end = endOfMonth(date);

  logMessage(`Calculated start date: ${format(start, 'yyyy-MM-dd')}`);
  logMessage(`Calculated end date: ${format(end, 'yyyy-MM-dd')}`);

  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
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

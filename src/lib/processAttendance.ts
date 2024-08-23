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
  format,
  parse,
  setDate,
  addMonths,
  subMonths,
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
  if (payrollPeriod === 'current') {
    const now = new Date();
    const currentDay = now.getDate();
    let startDate: Date, endDate: Date;

    if (currentDay < 26) {
      startDate = setDate(subMonths(now, 1), 26);
      endDate = setDate(now, 25);
    } else {
      startDate = setDate(now, 26);
      endDate = setDate(addMonths(now, 1), 25);
    }

    return {
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd'),
    };
  }

  const [month, year] = payrollPeriod.split('-');
  const date = parse(`${month} ${year}`, 'MMMM yyyy', new Date());
  const startDate = setDate(subMonths(date, 1), 26);
  const endDate = setDate(date, 25);

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
    const queryStartDate = parseISO(startDate);
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
      queryStartDate,
      queryEndDate,
    );

    const holidays = await attendanceService.getHolidaysForDateRange(
      queryStartDate,
      queryEndDate,
    );

    const processedAttendance = await attendanceService.processAttendanceData(
      attendanceRecords,
      userData,
      queryStartDate,
      queryEndDate,
      holidays,
    );

    const summary = await attendanceService.calculateSummary(
      processedAttendance.processedAttendance,
      queryStartDate,
      queryEndDate,
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
        periodStart: queryStartDate,
        periodEnd: parseISO(endDate),
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

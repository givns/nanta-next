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
  const [month, year] = payrollPeriod.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  const start = startOfMonth(date);
  const end = endOfMonth(date);

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

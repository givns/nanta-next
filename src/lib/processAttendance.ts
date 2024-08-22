import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData } from '../types/user';
import { parseISO, addDays, startOfDay, endOfDay } from 'date-fns';
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
  start: Date;
  end: Date;
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
      start: startOfDay(startDate),
      end: endOfDay(endDate),
    };
  }

  const [month, year] = payrollPeriod.split('-');
  const periodDate = parseISO(`${year}-${month}-01`);
  const startDate = new Date(
    periodDate.getFullYear(),
    periodDate.getMonth() - 1,
    26,
  );
  const endDate = new Date(periodDate.getFullYear(), periodDate.getMonth(), 25);

  return {
    start: startOfDay(startDate),
    end: endOfDay(endDate),
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

    logMessage(
      `Processing attendance for employee: ${employeeId} for period: ${payrollPeriod} (${startDate.toISOString()} to ${endDate.toISOString()})`,
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
      startDate,
      endDate,
    );

    logMessage(`Retrieved ${attendanceRecords.length} attendance records`);

    const holidays = await attendanceService.getHolidaysForDateRange(
      startDate,
      endDate,
    );

    const processedAttendance = await attendanceService.processAttendanceData(
      attendanceRecords,
      userData,
      startDate,
      endDate,
      holidays,
    );

    const summary = await attendanceService.calculateSummary(
      processedAttendance.processedAttendance,
      startDate,
      endDate,
    );

    const result = {
      success: true,
      summary,
      userData,
      processedAttendance,
      payrollPeriod: {
        period: payrollPeriod,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };

    await prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        periodStart: startDate,
        periodEnd: endDate,
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

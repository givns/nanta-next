// src/lib/processAttendance.ts

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData, AttendanceRecord, ShiftData } from '../types/user';
import { parseISO, format, parse, addMonths, subMonths } from 'date-fns';
import { logMessage } from '../utils/inMemoryLogger';
import { leaveServiceServer } from '../services/LeaveServiceServer';
import { addDays } from 'date-fns';

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
  logMessage(`Processing job data: ${JSON.stringify(job.data)}`);

  const { employeeId, payrollPeriod } = job.data;

  if (!employeeId) {
    throw new Error('Employee ID is required');
  }

  if (!payrollPeriod) {
    throw new Error('Payroll period is required');
  }

  const { start: startDate, end: endDate } =
    calculatePeriodDates(payrollPeriod);
  const queryEndDate = addDays(parseISO(endDate), 1); // Add one day to include the full last day

  logMessage(
    `Starting attendance processing for employee: ${employeeId} for period: ${payrollPeriod} (${startDate} to ${endDate})`,
  );

  try {
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: {
        assignedShift: true,
        department: true,
        potentialOvertimes: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    logMessage(`User found: ${user.name}`);

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      role: user.role as any,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift,
      overtimeHours: user.overtimeHours,
      potentialOvertimes:
        user.potentialOvertimes.map((overtime) => ({
          ...overtime,
          type: overtime.type as
            | 'early-check-in'
            | 'late-check-out'
            | 'day-off',
          status: overtime.status as 'pending' | 'approved' | 'rejected',
          periods: overtime.periods as
            | { start: string; end: string }[]
            | undefined,
          reviewedBy: overtime.reviewedBy || undefined,
          reviewedAt: overtime.reviewedAt || undefined,
        })) || [],
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    logMessage(`UserData prepared: ${JSON.stringify(userData)}`);

    const attendanceRecords: AttendanceRecord[] = []; // Declare the variable attendanceRecords

    const holidays = await attendanceService.getHolidaysForDateRange(
      new Date(startDate),
      new Date(endDate),
    );
    const noWorkDays = await attendanceService.getNoWorkDaysForDateRange(
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

    logMessage(`Processed ${processedAttendance.length} attendance records`);

    const summary = attendanceService.calculateSummary(
      processedAttendance.processedAttendance,
      new Date(startDate),
      new Date(endDate),
    );

    const isShift104 = userData.assignedShift.shiftCode === 'SHIFT104';

    const totalWorkingDays = attendanceService.calculateTotalWorkingDays(
      new Date(startDate),
      new Date(endDate),
      {
        ...userData.assignedShift,
        timezone: 'asia/Bangkok',
      },
      holidays,
      noWorkDays,
      isShift104,
    );

    const result = {
      success: true,
      summary,
      userData,
      processedAttendance,
      payrollPeriod: {
        period: payrollPeriod || 'Default',
        start: startDate,
        end: endDate,
      },
    };
    logMessage(`Summary object: ${JSON.stringify(summary)}`);

    // Store the result in the database
    await prisma.payrollProcessingResult.create({
      data: {
        employeeId,
        periodStart: new Date(startDate),
        periodEnd: new Date(endDate),
        totalWorkingDays,
        totalPresent: (await summary).totalPresent || 0,
        totalAbsent: (await summary).totalAbsent || 0,
        totalOvertimeHours: (await summary).totalOvertimeHours || 0,
        totalRegularHours: (await summary).totalRegularHours || 0,
        processedData: JSON.stringify(result),
      },
    });

    logMessage(
      `Payroll processing completed for job: ${job.id}, Result: ${JSON.stringify(result)}`,
    );

    return result;
  } catch (error: any) {
    logMessage(`Error processing payroll: ${error.message}`);
    console.error('Error processing payroll:', error);
    throw error;
  }
}

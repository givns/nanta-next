// src/lib/processAttendance.ts

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData, AttendanceRecord } from '../types/user';
import { parseISO, format, parse, addMonths, subMonths } from 'date-fns';
import { logMessage } from '../utils/inMemoryLogger';
import { leaveServiceServer } from '../services/LeaveServiceServer';

const prisma = new PrismaClient();
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

    // Fetch attendance records
    logMessage(`Fetching attendance records from external database...`);
    const { records: externalAttendances, totalCount } =
      await externalDbService.getHistoricalAttendanceRecords(
        user.employeeId,
        parseISO(startDate),
        parseISO(endDate),
      );

    logMessage(
      `Found ${externalAttendances.length} attendance records out of ${totalCount} total records`,
    );

    const attendanceRecords: AttendanceRecord[] = externalAttendances
      .map((externalRecord) =>
        attendanceService.convertExternalToAttendanceRecord(externalRecord),
      )
      .filter((record): record is AttendanceRecord => record !== undefined);

    // Fetch holidays
    const holidays = await holidayService.getHolidays(
      parseISO(startDate),
      parseISO(endDate),
    );
    logMessage(`Fetched ${holidays.length} holidays for the payroll period`);

    const { processedAttendance, summary } =
      await attendanceService.processAttendanceData(
        attendanceRecords,
        userData,
        parseISO(startDate),
        parseISO(endDate),
        holidays,
      );

    logMessage(`Processed ${processedAttendance.length} attendance records`);

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

    // Store the result in the database
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

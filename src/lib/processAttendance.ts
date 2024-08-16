// src/lib/processAttendance.ts

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData, AttendanceRecord } from '../types/user';
import { format, parseISO, subMonths, addMonths } from 'date-fns';
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

function calculatePayrollDates(payrollPeriod: string): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  let startDate = new Date(now.getFullYear(), now.getMonth(), 26);
  let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 25);

  if (payrollPeriod === 'previous') {
    startDate = subMonths(startDate, 1);
    endDate = subMonths(endDate, 1);
  } else if (payrollPeriod === 'next') {
    startDate = addMonths(startDate, 1);
    endDate = addMonths(endDate, 1);
  }

  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
  };
}

export async function processAttendance(job: Job): Promise<any> {
  const { employeeId, payrollPeriod } = job.data;
  const { startDate, endDate } = calculatePayrollDates(payrollPeriod);

  logMessage(
    `Starting attendance processing for employee: ${employeeId} from ${startDate} to ${endDate}`,
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

    const { processedAttendance, summary } =
      await attendanceService.processAttendanceData(
        attendanceRecords,
        userData,
        parseISO(startDate),
        parseISO(endDate),
      );

    logMessage(`Processed ${processedAttendance.length} attendance records`);

    const result = {
      success: true,
      summary,
      userData,
      processedAttendance,
      payrollPeriod: { start: startDate, end: endDate },
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

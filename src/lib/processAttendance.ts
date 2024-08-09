// lib/processAttendance.ts

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData, ProcessedAttendance, AttendanceRecord } from '../types/user';
import moment from 'moment-timezone';
import { logMessage } from '../utils/inMemoryLogger';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();
const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
);

export async function processAttendance(job: Job): Promise<any> {
  const { employeeId } = job.data;
  logMessage(`Starting attendance processing for employee: ${employeeId}`);

  try {
    // Fetch user data
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: {
        assignedShift: true,
        department: true,
      },
    });

    if (!user) {
      logMessage(`User not found for employeeId: ${employeeId}`);
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
      potentialOvertimes: [], // This should be populated if needed
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    logMessage(`UserData prepared: ${JSON.stringify(userData)}`);

    // Calculate payroll period
    const today = moment().tz('Asia/Bangkok');
    const startDate =
      moment(today).date() >= 26
        ? moment(today).date(26).startOf('day')
        : moment(today).subtract(1, 'month').date(26).startOf('day');
    const endDate = moment(startDate)
      .add(1, 'month')
      .subtract(1, 'day')
      .endOf('day');

    logMessage(
      `Payroll period: ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`,
    );

    // Fetch attendance records
    logMessage(`Fetching attendance records from external database...`);
    const { records: externalAttendances, totalCount } =
      await externalDbService.getHistoricalAttendanceRecords(
        user.employeeId,
        startDate.toDate(),
        endDate.toDate(),
      );

    logMessage(
      `Found ${externalAttendances.length} attendance records out of ${totalCount} total records`,
    );

    if (externalAttendances.length === 0) {
      logMessage('No attendance records found. Fetching sample records...');
      const { records: sampleRecords } =
        await externalDbService.getHistoricalAttendanceRecords(
          user.employeeId,
          moment().subtract(3, 'months').toDate(),
          moment().toDate(),
          1,
          5,
        );
      logMessage('Sample records:'); // Remove the second argument from this line
    }

    // Convert external attendance records to AttendanceRecord format
    const attendanceRecords: AttendanceRecord[] = externalAttendances.map(
      (externalRecord) =>
        attendanceService.convertExternalToAttendanceRecord(externalRecord),
    );

    logMessage(
      `Converted ${attendanceRecords.length} external records to AttendanceRecord format`,
    );

    // Process attendance data
    logMessage('Processing attendance data...');
    const processedAttendance = await attendanceService.processAttendanceData(
      attendanceRecords,
      userData,
      startDate.toDate(),
      endDate.toDate(),
    );

    logMessage(`Processed ${processedAttendance.length} attendance records`);

    // Calculate summary statistics
    const totalWorkingDays = processedAttendance.length;
    const totalPresent = processedAttendance.filter(
      (a) => a.status === 'present',
    ).length;
    const totalAbsent = totalWorkingDays - totalPresent;
    const totalOvertimeHours = processedAttendance.reduce(
      (sum, a) => sum + (a.overtimeHours || 0),
      0,
    );
    const totalRegularHours = processedAttendance.reduce(
      (sum, a) => sum + a.regularHours,
      0,
    );

    logMessage(`Summary statistics calculated:
      Total Working Days: ${totalWorkingDays}
      Total Present: ${totalPresent}
      Total Absent: ${totalAbsent}
      Total Overtime Hours: ${totalOvertimeHours}
      Total Regular Hours: ${totalRegularHours}`);

    // Store processed data
    const payrollProcessingResult = await prisma.payrollProcessingResult.create(
      {
        data: {
          employeeId: user.employeeId,
          periodStart: startDate.toDate(),
          periodEnd: endDate.toDate(),
          totalWorkingDays,
          totalPresent,
          totalAbsent,
          totalOvertimeHours,
          totalRegularHours,
          processedData: JSON.stringify(processedAttendance),
        },
      },
    );

    logMessage(
      `Payroll processing result stored with ID: ${payrollProcessingResult.id}`,
    );

    // Update user's overtime hours
    await prisma.user.update({
      where: { id: user.id },
      data: { overtimeHours: totalOvertimeHours },
    });

    logMessage(`User's overtime hours updated to: ${totalOvertimeHours}`);

    return {
      success: true,
      message: 'Payroll processed successfully',
      payrollProcessingResultId: payrollProcessingResult.id,
      summary: {
        totalWorkingDays,
        totalPresent,
        totalAbsent,
        totalOvertimeHours,
        totalRegularHours,
      },
    };
  } catch (error: any) {
    logMessage(`Error processing payroll: ${error.message}`);
    console.error('Error processing payroll:', error);
    throw error;
  }
}

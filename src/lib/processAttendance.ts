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
      potentialOvertimes: [],
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
    const attendances = await prisma.attendance.findMany({
      where: {
        employeeId: user.employeeId,
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
      orderBy: { date: 'asc' },
    });

    logMessage(`Found ${attendances.length} attendance records`);

    // Process each attendance record
    const processedAttendance: ProcessedAttendance[] = await Promise.all(
      attendances.map(async (attendance) => {
        logMessage(`Processing attendance for date: ${attendance.date}`);

        const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
          where: {
            employeeId: user.employeeId,
            date: attendance.date,
            status: 'approved',
          },
          include: { requestedShift: true },
        });

        logMessage(
          `Shift adjustment for ${attendance.date}: ${shiftAdjustment ? 'Found' : 'Not found'}`,
        );

        const effectiveShift =
          shiftAdjustment?.requestedShift || user.assignedShift;
        logMessage(`Effective shift: ${JSON.stringify(effectiveShift)}`);

        // Check if it's a day off
        const isDayOff = await attendanceService['isDayOff'](
          user.employeeId,
          attendance.date,
          effectiveShift,
        );
        logMessage(`Is day off: ${isDayOff}`);

        // Convert Attendance to AttendanceRecord
        const attendanceRecord: AttendanceRecord = {
          id: attendance.id,
          employeeId: attendance.employeeId,
          date: attendance.date,
          attendanceTime: attendance.checkInTime || attendance.date,
          checkInTime: attendance.checkInTime,
          checkOutTime: attendance.checkOutTime,
          isOvertime: attendance.isOvertime,
          isDayOff: isDayOff,
          overtimeStartTime: attendance.overtimeStartTime,
          overtimeEndTime: attendance.overtimeEndTime,
          overtimeHours: attendance.overtimeDuration || 0,
          overtimeDuration: attendance.overtimeDuration || 0,
          checkInLocation: attendance.checkInLocation as any,
          checkOutLocation: attendance.checkOutLocation as any,
          checkInAddress: attendance.checkInAddress,
          checkOutAddress: attendance.checkOutAddress,
          checkInReason: attendance.checkInReason,
          checkOutReason: attendance.checkOutReason,
          checkInPhoto: attendance.checkInPhoto,
          checkOutPhoto: attendance.checkOutPhoto,
          checkInDeviceSerial: attendance.checkInDeviceSerial,
          checkOutDeviceSerial: attendance.checkOutDeviceSerial,
          status: attendance.status,
          isManualEntry: attendance.isManualEntry,
        };

        logMessage(
          `AttendanceRecord prepared: ${JSON.stringify(attendanceRecord)}`,
        );

        const processedRecord = await attendanceService.processAttendanceRecord(
          attendanceRecord,
          effectiveShift,
          !isDayOff,
        );

        logMessage(`Processed attendance: ${JSON.stringify(processedRecord)}`);
        return processedRecord;
      }),
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
    };
  } catch (error: any) {
    logMessage(`Error processing payroll: ${error.message}`);
    console.error('Error processing payroll:', error);
    throw error;
  }
}

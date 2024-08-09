// lib/processAttendance.ts

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData, ProcessedAttendance, AttendanceRecord } from '../types/user';
import moment from 'moment-timezone';

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
      throw new Error('User not found');
    }

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      role: user.role as any, // Assuming role is stored as a string in the database
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

    // Process each attendance record
    const processedAttendance: ProcessedAttendance[] = await Promise.all(
      attendances.map(async (attendance) => {
        const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
          where: {
            employeeId: user.employeeId,
            date: attendance.date,
            status: 'approved',
          },
          include: { requestedShift: true },
        });

        const effectiveShift =
          shiftAdjustment?.requestedShift || user.assignedShift;

        // Check if it's a day off
        const isDayOff = await attendanceService['isDayOff'](
          user.employeeId,
          attendance.date,
          effectiveShift,
        );

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

        return attendanceService.processAttendanceRecord(
          attendanceRecord,
          effectiveShift,
          !isDayOff,
        );
      }),
    );

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

    // Update user's overtime hours
    await prisma.user.update({
      where: { id: user.id },
      data: { overtimeHours: totalOvertimeHours },
    });

    return {
      success: true,
      message: 'Payroll processed successfully',
      payrollProcessingResultId: payrollProcessingResult.id,
    };
  } catch (error) {
    console.error('Error processing payroll:', error);
    throw error;
  }
}

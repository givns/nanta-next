// lib/processAttendance.ts

import { Job } from 'bull';
import prisma from './prisma';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData, PotentialOvertime } from '../types/user';
import { UserRole } from '../types/enum';
import moment from 'moment-timezone';

const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();
const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
);

export async function processAttendance(
  job: Job,
): Promise<{ success: boolean; userId: string }> {
  console.log('Starting attendance processing for job:', job.id);
  const { employeeId } = job.data;

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

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      role: user.role as UserRole,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift,
      overtimeHours: user.overtimeHours,
      potentialOvertimes: user.potentialOvertimes as PotentialOvertime[],
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const today = moment().tz('Asia/Bangkok');
    const startDate = moment(today).subtract(1, 'month').startOf('day');
    const endDate = moment(today).endOf('day');

    const { records } = await externalDbService.getHistoricalAttendanceRecords(
      employeeId,
      startDate.toDate(),
      endDate.toDate(),
    );

    const attendanceRecords = records.map((record) =>
      attendanceService.convertExternalToAttendanceRecord(record),
    );

    const processedAttendance = await attendanceService.processAttendanceData(
      attendanceRecords,
      userData,
      startDate.toDate(),
      endDate.toDate(),
    );

    // Store the processed attendance in the database
    await prisma.processedAttendance.createMany({
      data: processedAttendance.map((attendance) => ({
        ...attendance,
        employeeId: user.employeeId,
      })),
    });

    console.log('Attendance processing completed successfully');
    return { success: true, userId: user.employeeId };
  } catch (error) {
    console.error('Error in attendance processing:', error);
    throw error;
  }
}

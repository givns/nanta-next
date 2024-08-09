// pages/api/check-payroll-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getAttendanceProcessingQueue } from '../../lib/queue';
import prisma from '../../lib/prisma';
import { AttendanceService } from '../../services/AttendanceService';
import { HolidayService } from '../../services/HolidayService';
import { Shift104HolidayService } from '../../services/Shift104HolidayService';
import { ExternalDbService } from '../../services/ExternalDbService';
import {
  ProcessedAttendance,
  UserData,
  AttendanceRecord,
} from '../../types/user';
import moment from 'moment-timezone';

const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();
const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { jobId, employeeId } = req.query;

  if (!jobId || !employeeId) {
    return res
      .status(400)
      .json({ error: 'Job ID and Employee ID are required' });
  }

  try {
    const queue = getAttendanceProcessingQueue();
    const job = await queue.getJob(jobId as string);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobStatus = await job.getState();

    if (jobStatus === 'completed') {
      const user = await prisma.user.findUnique({
        where: { employeeId: employeeId as string },
        include: {
          assignedShift: true,
          department: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
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

      const today = moment().tz('Asia/Bangkok');
      const startDate =
        moment(today).date() >= 26
          ? moment(today).date(26).startOf('day')
          : moment(today).subtract(1, 'month').date(26).startOf('day');
      const endDate = moment(startDate)
        .add(1, 'month')
        .subtract(1, 'day')
        .endOf('day');

      const attendances = await prisma.attendance.findMany({
        where: {
          employeeId: employeeId as string,
          date: {
            gte: startDate.toDate(),
            lte: endDate.toDate(),
          },
        },
        orderBy: { date: 'asc' },
      });

      const processedAttendance: ProcessedAttendance[] = await Promise.all(
        attendances.map(async (attendance) => {
          const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst(
            {
              where: {
                employeeId: userData.employeeId,
                date: attendance.date,
                status: 'approved',
              },
              include: { requestedShift: true },
            },
          );

          const effectiveShift =
            shiftAdjustment?.requestedShift || userData.assignedShift;

          // Use the isDayOff method from AttendanceService
          const isDayOff = await attendanceService['isDayOff'](
            userData.employeeId,
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
            checkInLocation: attendance.checkInLocation,
            checkOutLocation: attendance.checkOutLocation,
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

      res.status(200).json({
        status: 'completed',
        data: {
          userData,
          processedAttendance,
          summary: {
            totalWorkingDays,
            totalPresent,
            totalAbsent,
            totalOvertimeHours,
            totalRegularHours,
          },
          payrollPeriod: {
            start: startDate.format('YYYY-MM-DD'),
            end: endDate.format('YYYY-MM-DD'),
          },
        },
      });
    } else if (jobStatus === 'failed') {
      res.status(500).json({
        status: 'failed',
        error: 'Job processing failed',
      });
    } else {
      res.status(202).json({
        status: jobStatus,
        message: 'Job is still processing',
      });
    }
  } catch (error: any) {
    console.error('Error checking payroll processing status:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: error.message });
  }
}

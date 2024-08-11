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
import { leaveServiceServer } from '@/services/LeaveServiceServer';

const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();
const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
  leaveServiceServer,
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

      const payrollProcessingResult =
        await prisma.payrollProcessingResult.findFirst({
          where: {
            employeeId: employeeId as string,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      if (!payrollProcessingResult) {
        return res
          .status(404)
          .json({ error: 'Payroll processing result not found' });
      }

      const processedAttendance: ProcessedAttendance[] = JSON.parse(
        payrollProcessingResult.processedData as string,
      );

      res.status(200).json({
        status: 'completed',
        data: {
          userData,
          processedAttendance,
          summary: {
            totalWorkingDays: payrollProcessingResult.totalWorkingDays,
            totalPresent: payrollProcessingResult.totalPresent,
            totalAbsent: payrollProcessingResult.totalAbsent,
            totalOvertimeHours: payrollProcessingResult.totalOvertimeHours,
            totalRegularHours: payrollProcessingResult.totalRegularHours,
          },
          payrollPeriod: {
            start: payrollProcessingResult.periodStart,
            end: payrollProcessingResult.periodEnd,
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

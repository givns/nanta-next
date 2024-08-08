// pages/api/test-payroll-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '../../services/ExternalDbService';
import { HolidayService } from '../../services/HolidayService';
import { Shift104HolidayService } from '../../services/Shift104HolidayService';
import {
  ProcessedAttendance,
  UserData,
  AttendanceRecord,
  PotentialOvertime,
} from '../../types/user';
import moment from 'moment-timezone';
import { logMessage } from '../../utils/inMemoryLogger';

const prisma = new PrismaClient();
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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.body;

  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  const logs: string[] = [];
  const log = (message: string) => {
    logMessage(message);
    logs.push(message);
  };

  try {
    log(`Starting payroll processing test for employee ID: ${employeeId}`);

    // Fetch user data
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
      role: user.role as any, // Cast to UserRole enum if necessary
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

    log(`User data fetched: ${JSON.stringify(userData)}`);

    // Calculate payroll period
    const today = moment().tz('Asia/Bangkok');
    const startDate =
      moment(today).date() >= 26
        ? moment(today).date(26).startOf('day')
        : moment(today).subtract(1, 'month').date(26).startOf('day');
    const endDate = moment(today).endOf('day');

    log(
      `Payroll period: ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`,
    );

    // Fetch external attendance data
    log('Fetching external attendance data');
    const externalAttendanceData =
      await externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate.toDate(),
        endDate.toDate(),
      );
    log(
      `External attendance records fetched: ${externalAttendanceData.length}`,
    );

    // Fetch internal attendance data
    log('Fetching internal attendance data');
    const internalAttendanceData = await prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
    });
    log(
      `Internal attendance records fetched: ${internalAttendanceData.length}`,
    );

    // Merge and process attendance data
    log('Processing attendance data');
    const mergedAttendanceData: AttendanceRecord[] = [
      ...externalAttendanceData.map(
        attendanceService.convertExternalToAttendanceRecord,
      ),
      ...internalAttendanceData.map(
        attendanceService.convertInternalToAttendanceRecord,
      ),
    ];
    const processedAttendance = await attendanceService.processAttendanceData(
      mergedAttendanceData,
      userData,
      startDate.toDate(),
      endDate.toDate(),
    );
    log(`Processed attendance records: ${processedAttendance.length}`);

    // Calculate summary statistics
    const totalWorkingDays = processedAttendance.length;
    const totalPresent = processedAttendance.filter(
      (a) => a.status === 'present',
    ).length;
    const totalAbsent = totalWorkingDays - totalPresent;
    const overtimeHours = processedAttendance.reduce(
      (sum, a) => sum + (a.overtimeHours || 0),
      0,
    );

    log('Calculating leave balances');
    const leaveBalances = {
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
    };

    // Fetch shift adjustments
    log('Fetching shift adjustments');
    const shiftAdjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
        status: 'approved',
      },
      include: { requestedShift: true },
    });
    log(`Shift adjustments fetched: ${shiftAdjustments.length}`);

    // Fetch approved overtimes
    log('Fetching approved overtimes');
    const approvedOvertimes = await prisma.approvedOvertime.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
    });
    log(`Approved overtimes fetched: ${approvedOvertimes.length}`);

    const result = {
      userData,
      payrollPeriod: {
        start: startDate.format('YYYY-MM-DD'),
        end: endDate.format('YYYY-MM-DD'),
      },
      processedAttendance,
      summary: {
        totalWorkingDays,
        totalPresent,
        totalAbsent,
        overtimeHours,
      },
      leaveBalances,
      shiftAdjustments,
      approvedOvertimes,
      logs,
    };

    log('Test payroll processing completed successfully');
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in test payroll processing:', error);
    log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({ error: 'Internal server error', logs });
  }
}

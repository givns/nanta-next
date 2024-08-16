// pages/api/user-dashboard-data.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '../../services/ExternalDbService';
import { HolidayService } from '../../services/HolidayService';
import { Shift104HolidayService } from '../../services/Shift104HolidayService';
import {
  UserData,
  ProcessedAttendance,
  ShiftAdjustment,
  ApprovedOvertime,
  AttendanceRecord,
} from '../../types/user';
import moment from 'moment-timezone';
import { leaveServiceServer } from '@/services/LeaveServiceServer';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ error: 'Valid Employee ID is required' });
  }

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
      return res.status(404).json({ error: 'User not found' });
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
      potentialOvertimes: user.potentialOvertimes.map((overtime) => ({
        ...overtime,
        type: overtime.type as 'early-check-in' | 'late-check-out' | 'day-off',
        status: overtime.status as 'approved' | 'pending' | 'rejected',
        periods: overtime.periods as
          | { start: string; end: string }[]
          | undefined,
        reviewedBy: overtime.reviewedBy || undefined,
        reviewedAt: overtime.reviewedAt ?? undefined,
      })),
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

    // Fetch external attendance data
    const externalAttendanceData =
      await externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate.toDate(),
        endDate.toDate(),
      );

    // Fetch internal attendance data
    const internalAttendanceData = await prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
    });

    // Merge and process attendance data
    const { records: externalAttendanceRecords, totalCount } =
      await externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate.toDate(),
        endDate.toDate(),
      );

    const mergedAttendanceData: AttendanceRecord[] = [
      ...externalAttendanceRecords
        .map(attendanceService.convertExternalToAttendanceRecord)
        .filter((record): record is AttendanceRecord => record !== undefined),
      ...internalAttendanceData.map(
        attendanceService.convertInternalToAttendanceRecord,
      ),
    ];

    const { processedAttendance, summary } =
      await attendanceService.processAttendanceData(
        mergedAttendanceData,
        userData,
        startDate.toDate(),
        endDate.toDate(),
      );

    // Fetch time entries
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
      orderBy: { date: 'asc' },
    });

    // Fetch shift adjustments
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

    // Fetch approved overtimes
    const approvedOvertimes = await prisma.approvedOvertime.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
    });

    // Calculate summary statistics
    const totalWorkingDays = processedAttendance.length;
    const totalPresent = processedAttendance.filter(
      (a) => a.status === 'present',
    ).length;
    const totalAbsent = totalWorkingDays - totalPresent;
    const overtimeHours = timeEntries.reduce(
      (sum, entry) => sum + entry.overtimeHours,
      0,
    );
    const regularHours = timeEntries.reduce(
      (sum, entry) => sum + entry.regularHours,
      0,
    );

    const responseData = {
      user: userData,
      payrollPeriod: {
        start: startDate.format('YYYY-MM-DD'),
        end: endDate.format('YYYY-MM-DD'),
      },
      processedAttendance,
      timeEntries,
      shiftAdjustments: shiftAdjustments.map(
        (adj) =>
          ({
            date: adj.date.toISOString().split('T')[0],
            requestedShiftId: adj.requestedShiftId,
            requestedShift: adj.requestedShift,
            status: adj.status,
            reason: adj.reason,
            createdAt: adj.createdAt,
            updatedAt: adj.updatedAt,
          }) as ShiftAdjustment,
      ),
      approvedOvertimes: approvedOvertimes.map(
        (ot) =>
          ({
            id: ot.id,
            employeeId: ot.employeeId,
            date: ot.date,
            startTime: ot.startTime.toISOString(),
            endTime: ot.endTime.toISOString(),
            status: ot.status,
            approvedBy: ot.approvedBy,
            approvedAt: ot.approvedAt,
          }) as ApprovedOvertime,
      ),
      summary: {
        totalWorkingDays,
        totalPresent,
        totalAbsent,
        regularHours,
        overtimeHours,
      },
      leaveBalances: {
        sickLeaveBalance: user.sickLeaveBalance,
        businessLeaveBalance: user.businessLeaveBalance,
        annualLeaveBalance: user.annualLeaveBalance,
        overtimeLeaveBalance: user.overtimeLeaveBalance,
      },
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user dashboard data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

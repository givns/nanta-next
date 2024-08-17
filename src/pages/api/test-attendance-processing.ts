// pages/api/test-attendance-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '../../services/ExternalDbService';
import { HolidayService } from '../../services/HolidayService';
import { Shift104HolidayService } from '../../services/Shift104HolidayService';
import { UserData, AttendanceRecord } from '../../types/user';
import moment from 'moment-timezone';
import { leaveServiceServer } from '@/services/LeaveServiceServer';
import { startOfDay, endOfDay, subMonths, format } from 'date-fns';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.body;

  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
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

    const today = new Date();

    // Calculate the start and end dates
    const startDate = startOfDay(subMonths(today, 1));
    const endDate = endOfDay(today);

    // Fetch attendance data (you might need to implement this method in your ExternalDbService)
    const attendanceData =
      await externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate,
        endDate,
      );

    const { records, totalCount } =
      await externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate,
        endDate,
      );

    const attendanceRecords: AttendanceRecord[] = records
      .map((record) =>
        attendanceService.convertExternalToAttendanceRecord(record),
      )
      .filter((record): record is AttendanceRecord => record !== undefined);

    const holidays = await holidayService.getHolidays(startDate, endDate);

    const processedAttendance = await attendanceService.processAttendanceData(
      attendanceRecords,
      userData,
      startDate,
      endDate,
      holidays,
    );
    res.status(200).json({
      userData,
      processedAttendance,
      payrollPeriod: {
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
      },
      // Add other necessary data here
    });
  } catch (error) {
    console.error('Error processing sample attendance data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

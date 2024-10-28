// pages/api/admin/attendance/daily.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '@/services/AttendanceService';
import { HolidayService } from '@/services/HolidayService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { startOfDay, endOfDay, parseISO, format } from 'date-fns';
import { AttendanceData } from '@/types/attendance';

const prisma = new PrismaClient();

// Initialize services
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
const shiftService = new ShiftManagementService(prisma, holidayService);
const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const timeEntryService = new TimeEntryService(
  prisma,
  shiftService,
  notificationService,
);
const overtimeService = new OvertimeServiceServer(
  prisma,
  holidayService,
  leaveServiceServer,
  shiftService,
  timeEntryService,
  notificationService,
);

// Initialize AttendanceService
const attendanceService = new AttendanceService(
  prisma,
  shiftService,
  holidayService,
  leaveServiceServer,
  overtimeService,
  notificationService,
  timeEntryService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true, departmentId: true, employeeId: true },
    });

    if (!user || !['Admin', 'SuperAdmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    switch (req.method) {
      case 'GET':
        return handleGetDailyAttendance(req, res, user);
      case 'POST':
        return handleManualEntry(req, res, user);
      case 'PUT':
        return handleUpdateAttendance(req, res, user);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in daily attendance API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET handler for fetching daily attendance
async function handleGetDailyAttendance(
  req: NextApiRequest,
  res: NextApiResponse,
  user: { role: string; departmentId: string | null },
) {
  try {
    const { date, department } = req.query;
    const targetDate = date ? parseISO(date as string) : new Date();

    // Fetch all employees based on role and department access
    const whereClause =
      user.role === 'Admin' && user.departmentId
        ? { departmentId: user.departmentId }
        : department
          ? { departmentId: department as string }
          : {};

    const employees = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        employeeId: true,
        name: true,
        departmentName: true,
        shiftCode: true,
      },
    });

    // Fetch attendance records for all employees
    const attendanceRecords = await Promise.all(
      employees.map(async (employee) => {
        const [attendanceStatus, shiftData] = await Promise.all([
          attendanceService.getLatestAttendanceStatus(employee.employeeId),
          shiftService.getEffectiveShiftAndStatus(
            employee.employeeId,
            targetDate,
          ),
        ]);

        const attendance = await prisma.attendance.findFirst({
          where: {
            employeeId: employee.employeeId,
            date: {
              gte: startOfDay(targetDate),
              lte: endOfDay(targetDate),
            },
          },
        });

        return {
          employeeId: employee.employeeId,
          employeeName: employee.name,
          departmentName: employee.departmentName,
          date: format(targetDate, 'yyyy-MM-dd'),
          shift: shiftData?.effectiveShift
            ? {
                startTime: shiftData.effectiveShift.startTime,
                endTime: shiftData.effectiveShift.endTime,
                name: shiftData.effectiveShift.name,
              }
            : null,
          attendance: attendance
            ? {
                id: attendance.id,
                regularCheckInTime:
                  attendance.regularCheckInTime?.toISOString() || null,
                regularCheckOutTime:
                  attendance.regularCheckOutTime?.toISOString() || null,
                isLateCheckIn: attendance.isLateCheckIn || false,
                isLateCheckOut: attendance.isLateCheckOut || false,
                isEarlyCheckIn: attendance.isEarlyCheckIn || false,
                isVeryLateCheckOut: attendance.isVeryLateCheckOut || false,
                lateCheckOutMinutes: attendance.lateCheckOutMinutes || 0,
                status: attendanceStatus?.status || 'absent',
              }
            : null,
        };
      }),
    );

    return res.status(200).json(attendanceRecords);
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    return res
      .status(500)
      .json({ error: 'Failed to fetch attendance records' });
  }
}

// POST handler for manual attendance entry
async function handleManualEntry(
  req: NextApiRequest,
  res: NextApiResponse,
  actionUser: { role: string; departmentId: string | null; employeeId: string },
) {
  try {
    const { employeeId, date, checkInTime, checkOutTime, reason } = req.body;

    if (!employeeId || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const targetEmployee = await prisma.user.findUnique({
      where: { employeeId },
      select: {
        departmentId: true,
        lineUserId: true,
        name: true,
      },
    });

    if (
      !targetEmployee ||
      (actionUser.role === 'Admin' &&
        actionUser.departmentId &&
        targetEmployee.departmentId !== actionUser.departmentId)
    ) {
      return res
        .status(403)
        .json({ error: "Unauthorized to modify this employee's attendance" });
    }

    const targetDate = parseISO(date);

    let attendance;
    // Process check-in if provided
    if (checkInTime) {
      const attendanceData: AttendanceData = {
        employeeId,
        lineUserId: targetEmployee.lineUserId,
        checkTime: `${date}T${checkInTime}`,
        reason,
        isCheckIn: true,
        isManualEntry: true,
      };
      attendance = await attendanceService.processAttendance(attendanceData);
    }

    // Process check-out if provided
    if (checkOutTime) {
      if (!attendance && !checkInTime) {
        return res
          .status(400)
          .json({ error: 'Cannot check out without check in' });
      }
      const attendanceData: AttendanceData = {
        employeeId,
        lineUserId: targetEmployee.lineUserId,
        checkTime: `${date}T${checkOutTime}`,
        reason,
        isCheckIn: false,
        isManualEntry: true,
      };
      attendance = await attendanceService.processAttendance(attendanceData);
    }

    // Notify about manual entry
    const notificationMessage = {
      type: 'text',
      text: `Manual attendance entry by ${actionUser.employeeId}:
  Employee: ${targetEmployee.name}
  Date: ${format(targetDate, 'dd/MM/yyyy')}
  ${checkInTime ? `Check-in: ${checkInTime}` : ''}
  ${checkOutTime ? `Check-out: ${checkOutTime}` : ''}
  Reason: ${reason}`,
    };

    await notifyManagersAndAdmins(
      JSON.stringify(notificationMessage),
      actionUser.employeeId,
    );

    return res.status(200).json(attendance);
  } catch (error) {
    console.error('Error creating manual entry:', error);
    return res.status(500).json({ error: 'Failed to create manual entry' });
  }
}

// PUT handler for updating attendance records
async function handleUpdateAttendance(
  req: NextApiRequest,
  res: NextApiResponse,
  actionUser: { role: string; departmentId: string | null; employeeId: string },
) {
  try {
    const { attendanceId, updates } = req.body;

    if (!attendanceId || !updates) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { user: true },
    });

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    if (
      actionUser.role === 'Admin' &&
      actionUser.departmentId &&
      attendance.user.departmentId !== actionUser.departmentId
    ) {
      return res
        .status(403)
        .json({ error: 'Unauthorized to modify this attendance record' });
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        ...updates,
        isManualEntry: true,
      },
    });

    await timeEntryService.createOrUpdateTimeEntry(
      updatedAttendance,
      false,
      null,
    );

    // Notify about attendance update
    const notificationMessage = {
      type: 'text',
      text: `Attendance record updated by ${actionUser.employeeId}:
  Employee: ${attendance.user.name}
  Date: ${format(attendance.date, 'dd/MM/yyyy')}
  Updates: ${Object.keys(updates).join(', ')}`,
    };

    await notifyManagersAndAdmins(
      JSON.stringify(notificationMessage),
      actionUser.employeeId,
    );

    return res.status(200).json(updatedAttendance);
  } catch (error) {
    console.error('Error updating attendance:', error);
    return res
      .status(500)
      .json({ error: 'Failed to update attendance record' });
  }
}

// Utility function to notify managers
async function notifyManagersAndAdmins(
  message: string,
  excludeEmployeeId?: string,
): Promise<void> {
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ['Manager', 'Admin', 'SuperAdmin'] },
      ...(excludeEmployeeId && { NOT: { employeeId: excludeEmployeeId } }),
    },
    select: {
      employeeId: true,
      lineUserId: true,
    },
  });

  for (const manager of managers) {
    if (manager.lineUserId) {
      await notificationService.sendNotification(
        manager.employeeId,
        manager.lineUserId,
        message,
        'attendance',
      );
    }
  }
}

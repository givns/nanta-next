// pages/api/admin/attendance/manual-entry.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '@/services/AttendanceService';
import { getCurrentTime } from '@/utils/dateUtils';
import { endOfDay, format, parseISO, startOfDay } from 'date-fns';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { HolidayService } from '@/services/HolidayService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
export const notificationService = createNotificationService(prisma);
export const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const shiftService = new ShiftManagementService(prisma, holidayService);

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

shiftService.setOvertimeService(overtimeService);

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const actionUser = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true, departmentId: true, employeeId: true },
    });

    if (!actionUser || !['Admin', 'SuperAdmin'].includes(actionUser.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { employeeId, date, checkInTime, checkOutTime, reason } = req.body;

    // 1. Validate target employee
    const targetEmployee = await prisma.user.findUnique({
      where: { employeeId },
      include: {
        assignedShift: true,
      },
    });

    if (!targetEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // 2. Check department access for Admin role
    if (
      actionUser.role === 'Admin' &&
      actionUser.departmentId &&
      targetEmployee.departmentId !== actionUser.departmentId
    ) {
      return res
        .status(403)
        .json({ error: "Unauthorized to modify this employee's attendance" });
    }

    const targetDate = startOfDay(parseISO(date));

    // 3. Get or create base attendance record
    let existingAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(targetDate),
          lt: endOfDay(targetDate),
        },
      },
    });

    // 4. Process check-in if provided
    if (checkInTime) {
      const checkInDateTime = `${date}T${checkInTime}`;

      const attendanceData = {
        employeeId,
        lineUserId: targetEmployee.lineUserId,
        isCheckIn: true,
        checkTime: checkInDateTime,
        reason,
        isManualEntry: true,
        location: targetEmployee.departmentName || '',
        checkInAddress: targetEmployee.departmentName || '',
      };

      await attendanceService.processAttendance(attendanceData);
    }

    // 5. Process check-out if provided
    if (checkOutTime) {
      const checkOutDateTime = `${date}T${checkOutTime}`;

      const attendanceData = {
        employeeId,
        lineUserId: targetEmployee.lineUserId,
        isCheckIn: false,
        checkTime: checkOutDateTime,
        reason,
        isManualEntry: true,
        location: targetEmployee.departmentName || '',
        checkOutAddress: targetEmployee.departmentName || '',
      };

      await attendanceService.processAttendance(attendanceData);
    }

    // 6. Notify relevant parties
    const notificationMessage = {
      type: 'text',
      text: `Manual attendance update by ${actionUser.employeeId}:
Employee: ${targetEmployee.name}
Date: ${format(targetDate, 'dd/MM/yyyy')}
${checkInTime ? `Check-in: ${checkInTime}` : ''}
${checkOutTime ? `Check-out: ${checkOutTime}` : ''}
Reason: ${reason}`,
    };

    // Notify managers and admins
    await notifyManagersAndAdmins(notificationMessage, actionUser.employeeId);

    // Notify employee
    if (targetEmployee.lineUserId) {
      await notificationService.sendNotification(
        targetEmployee.employeeId,
        targetEmployee.lineUserId,
        JSON.stringify(notificationMessage),
        'attendance',
      );
    }

    // 7. Update associated time entries
    await timeEntryService.createOrUpdateTimeEntry(
      existingAttendance!,
      false,
      null,
    );

    // 8. Return updated attendance status
    const updatedStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    return res.status(200).json(updatedStatus);
  } catch (error) {
    console.error('Error in manual entry:', error);
    return res.status(500).json({
      error: 'Failed to process manual entry',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function notifyManagersAndAdmins(
  message: any,
  excludeEmployeeId?: string,
) {
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ['Manager', 'Admin', 'SuperAdmin'] },
      NOT: { employeeId: excludeEmployeeId },
    },
    select: { employeeId: true, lineUserId: true },
  });

  for (const manager of managers) {
    if (manager.lineUserId) {
      await notificationService.sendNotification(
        manager.employeeId,
        manager.lineUserId,
        JSON.stringify(message),
        'attendance',
      );
    }
  }
}

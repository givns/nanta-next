// pages/api/admin/attendance/manual-entry.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { parseISO, startOfDay, endOfDay, format } from 'date-fns';
import { NotificationService } from '@/services/NotificationService';
import { TimeEntryService } from '@/services/TimeEntryService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const shiftService = new ShiftManagementService(prisma, holidayService);
const notificationService = new NotificationService(prisma);
const timeEntryService = new TimeEntryService(
  prisma,
  shiftService,
  notificationService,
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
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { employeeId, date, checkInTime, checkOutTime, reason } = req.body;

    console.log('Manual entry request:', {
      employeeId,
      date,
      checkInTime,
      checkOutTime,
      reason,
    });

    // Get employee and admin data
    const [targetEmployee, actionUser] = await Promise.all([
      prisma.user.findUnique({
        where: { employeeId },
        include: {
          assignedShift: true,
        },
      }),
      prisma.user.findUnique({
        where: { lineUserId },
        select: { role: true, departmentId: true, employeeId: true },
      }),
    ]);

    if (!targetEmployee || !actionUser) {
      return res.status(404).json({
        success: false,
        message: 'Employee or admin user not found',
      });
    }

    // Check permissions
    if (
      actionUser.role === 'Admin' &&
      actionUser.departmentId &&
      targetEmployee.departmentId !== actionUser.departmentId
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to modify this employee's attendance",
      });
    }

    const targetDate = startOfDay(parseISO(date));

    // Get effective shift for the date
    const shiftData = await shiftService.getEffectiveShiftAndStatus(
      employeeId,
      targetDate,
    );

    if (!shiftData?.effectiveShift) {
      return res.status(400).json({
        success: false,
        message: 'No shift found for this date',
      });
    }

    // Parse shift times
    const shiftStart = parseISO(
      `${date}T${shiftData.effectiveShift.startTime}`,
    );
    const shiftEnd = parseISO(`${date}T${shiftData.effectiveShift.endTime}`);

    // Find existing attendance
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: targetDate,
          lt: endOfDay(targetDate),
        },
      },
    });

    let updatedAttendance;

    if (existingAttendance) {
      // Update existing record
      const updateData: any = {
        isManualEntry: true,
        shiftStartTime: shiftStart,
        shiftEndTime: shiftEnd,
        isDayOff: !shiftData.effectiveShift.workDays.includes(
          targetDate.getDay(),
        ),
      };

      if (checkInTime) {
        const checkInDateTime = parseISO(`${date}T${checkInTime}`);
        updateData.regularCheckInTime = checkInDateTime;
        updateData.isLateCheckIn = checkInDateTime > shiftStart;
        updateData.isEarlyCheckIn = checkInDateTime < shiftStart;
        updateData.checkInReason = reason;
      }

      if (checkOutTime) {
        const checkOutDateTime = parseISO(`${date}T${checkOutTime}`);
        updateData.regularCheckOutTime = checkOutDateTime;
        updateData.isLateCheckOut = checkOutDateTime > shiftEnd;
        updateData.status = 'present';
      }

      updatedAttendance = await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: updateData,
      });
    } else {
      // Create new record
      const checkInDateTime = checkInTime
        ? parseISO(`${date}T${checkInTime}`)
        : null;
      const checkOutDateTime = checkOutTime
        ? parseISO(`${date}T${checkOutTime}`)
        : null;

      updatedAttendance = await prisma.attendance.create({
        data: {
          employeeId,
          date: targetDate,
          shiftStartTime: shiftStart,
          shiftEndTime: shiftEnd,
          regularCheckInTime: checkInDateTime,
          regularCheckOutTime: checkOutDateTime,
          isLateCheckIn: checkInDateTime ? checkInDateTime > shiftStart : false,
          isEarlyCheckIn: checkInDateTime
            ? checkInDateTime < shiftStart
            : false,
          isLateCheckOut: checkOutDateTime
            ? checkOutDateTime > shiftEnd
            : false,
          status: checkOutDateTime ? 'present' : 'incomplete',
          isManualEntry: true,
          checkInReason: reason,
          version: 0,
          isDayOff: !shiftData.effectiveShift.workDays.includes(
            targetDate.getDay(),
          ),
        },
      });
    }

    // Create/update time entry
    await timeEntryService.createOrUpdateTimeEntry(
      updatedAttendance,
      false,
      null,
    );

    // Send notifications
    try {
      if (targetEmployee.lineUserId) {
        await notificationService.sendNotification(
          targetEmployee.employeeId,
          targetEmployee.lineUserId,
          `Your attendance record for ${format(targetDate, 'dd/MM/yyyy')} has been updated by admin.\nReason: ${reason}`,
          'attendance',
        );
      }

      // Notify managers
      const managers = await prisma.user.findMany({
        where: {
          role: { in: ['Manager', 'Admin', 'SuperAdmin'] },
          NOT: { employeeId: actionUser.employeeId },
        },
        select: { employeeId: true, lineUserId: true },
      });

      for (const manager of managers) {
        if (manager.lineUserId) {
          await notificationService.sendNotification(
            manager.employeeId,
            manager.lineUserId,
            `Attendance manual entry by ${actionUser.employeeId}:\nEmployee: ${targetEmployee.name}\nDate: ${format(targetDate, 'dd/MM/yyyy')}\nReason: ${reason}`,
            'attendance',
          );
        }
      }
    } catch (notifyError) {
      console.error('Failed to send notifications:', notifyError);
    }

    return res.status(200).json({
      success: true,
      message: 'Attendance record updated successfully',
      data: updatedAttendance,
    });
  } catch (error) {
    console.error('Error in manual entry:', error);
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to process manual entry',
    });
  }
}

// create-manager-request.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../../../services/NotificationService';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import { HolidayService } from '../../../services/HolidayService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const notificationService = new NotificationService(prisma);
const shiftManagementService = new ShiftManagementService(
  prisma,
  holidayService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    lineUserId,
    employeeIds,
    departmentNames,
    date,
    startTime,
    endTime,
    reasons,
  } = req.body;

  try {
    const manager = await prisma.user.findUnique({ where: { lineUserId } });
    if (!manager) {
      return res.status(404).json({ message: 'User not found' });
    }

    const formattedReason = reasons
      .map((r: any) => `${r.reason}: ${r.details}`)
      .join('; ');

    const overtimeDate = new Date(date);
    const isHoliday = await holidayService.isHoliday(overtimeDate, [], false);

    const createdRequests = await Promise.all(
      employeeIds.map(async (employeeId: string) => {
        try {
          const employee = await prisma.user.findUnique({
            where: { employeeId },
            include: { assignedShift: true },
          });
          if (!employee) {
            console.warn(`Employee with id ${employeeId} not found`);
            return null;
          }

          // Check if the employee is in one of the allowed departments
          if (!departmentNames.includes(employee.departmentName)) {
            console.warn(
              `Employee ${employeeId} is not in an allowed department`,
            );
            return null;
          }

          // Check if it's a day off for the employee
          const shiftData =
            await shiftManagementService.getEffectiveShiftAndStatus(
              employee.employeeId,
              overtimeDate,
            );
          const isDayOff =
            isHoliday ||
            !shiftData.effectiveShift.workDays.includes(overtimeDate.getDay());

          const request = await prisma.overtimeRequest.create({
            data: {
              employeeId: employee.employeeId,
              name: employee.name,
              date: overtimeDate,
              startTime,
              endTime,
              reason: formattedReason,
              status: 'pending_response',
              approverId: manager.id,
              isDayOffOvertime: isDayOff,
            },
          });

          if (employee.lineUserId) {
            await notificationService.sendOvertimeRequestNotification(
              request,
              employee.employeeId,
              employee.lineUserId,
            );
          } else {
            console.warn(
              `Employee ${employee.employeeId} does not have a LINE User ID`,
            );
          }

          return request;
        } catch (error) {
          console.error(
            `Error creating overtime request for employee ${employeeId}:`,
            error,
          );
          return null;
        }
      }),
    );

    const successfulRequests = createdRequests.filter(
      (request) => request !== null,
    );

    res.status(201).json({
      message: 'Overtime requests created successfully',
      data: successfulRequests,
      failedCount: createdRequests.length - successfulRequests.length,
    });
  } catch (error: any) {
    console.error('Error creating overtime requests:', error);
    res.status(500).json({
      message: 'Error creating overtime requests',
      error: error.message,
    });
  }
}

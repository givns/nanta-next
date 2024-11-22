// create-manager-request.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../../../services/NotificationService';
import { ShiftManagementService } from '../../../services/ShiftManagementService/ShiftManagementService';
import { HolidayService } from '../../../services/HolidayService';
import { initializeServices } from '@/services/ServiceInitializer';
import { AttendanceService } from '@/services/Attendance/AttendanceService';

const prisma = new PrismaClient();
const services = initializeServices(prisma);
const attendanceService = new AttendanceService(
  prisma,
  services.shiftService,
  services.holidayService,
  services.leaveService,
  services.overtimeService,
  services.notificationService,
  services.timeEntryService,
);

interface OvertimeRequestData {
  lineUserId: string;
  employeeIds: string[];
  departmentNames: string[];
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reasons: { reason: string; details: string }[];
}

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
    durationMinutes,
    reasons,
  } = req.body as OvertimeRequestData;

  try {
    const manager = await prisma.user.findUnique({ where: { lineUserId } });
    if (!manager) {
      return res.status(404).json({ message: 'User not found' });
    }

    const formattedReason = reasons
      .map((r: any) => `${r.reason}: ${r.details}`)
      .join('; ');

    const overtimeDate = new Date(date);
    const isHoliday = await services.holidayService.isHoliday(
      overtimeDate,
      [],
      false,
    );

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

          // Check department
          if (!departmentNames.includes(employee.departmentName)) {
            console.warn(
              `Employee ${employeeId} is not in an allowed department`,
            );
            return null;
          }

          // Get effective shift
          const shiftData =
            await services.shiftService.getEffectiveShiftAndStatus(
              employee.employeeId,
              overtimeDate,
            );

          // Check if it's a day off
          const isDayOffOvertime =
            isHoliday ||
            (shiftData &&
              !shiftData.effectiveShift.workDays.includes(
                overtimeDate.getDay(),
              ));

          // Determine if overtime is inside or outside shift hours
          const requestStartTime = parseTime(startTime);
          const requestEndTime = parseTime(endTime);
          const shiftStartTime = shiftData?.effectiveShift?.startTime
            ? parseTime(shiftData.effectiveShift.startTime)
            : null;
          const shiftEndTime = shiftData?.effectiveShift?.endTime
            ? parseTime(shiftData.effectiveShift.endTime)
            : null;

          // For day off overtime, check if it's within regular shift hours
          const isInsideShift =
            isDayOffOvertime &&
            shiftStartTime !== null &&
            shiftEndTime !== null &&
            requestStartTime >= shiftStartTime &&
            requestEndTime <= shiftEndTime;

          const request = await prisma.overtimeRequest.create({
            data: {
              employeeId: employee.employeeId,
              name: employee.name,
              date: overtimeDate,
              startTime,
              endTime,
              durationMinutes,
              reason: formattedReason,
              status: 'pending_response',
              approverId: manager.id,
              isDayOffOvertime: isDayOffOvertime ?? false, // Ensure isDayOffOvertime is always a boolean
              isInsideShiftHours: isInsideShift || false, // Only relevant for day off OT
            },
          });

          // Send notification
          if (employee.lineUserId) {
            await services.notificationService.sendOvertimeRequestNotification(
              request,
              employee.employeeId,
              employee.lineUserId,
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

// Helper function to parse time string to minutes since midnight
function parseTime(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

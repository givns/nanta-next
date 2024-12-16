import type { NextApiRequest, NextApiResponse } from 'next';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PrismaClient,
} from '@prisma/client';
import { parseISO, startOfDay, format, addHours, addMinutes } from 'date-fns';
import { initializeServices } from '@/services/ServiceInitializer';
import { PeriodType, TimeEntryStatus } from '@/types/attendance/status';
import { ErrorCode, AppError } from '@/types/attendance/error';
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
    const {
      employeeId,
      date,
      checkInTime,
      checkOutTime,
      reason,
      periodType,
      reasonType,
      overtimeRequestId,
    } = req.body;

    // Validate inputs
    if (
      !employeeId ||
      !date ||
      (!checkInTime && !checkOutTime) ||
      !periodType
    ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Start transaction
    return await prisma.$transaction(async (tx) => {
      // Get permissions and data
      const [targetEmployee, actionUser] = await Promise.all([
        tx.user.findUnique({
          where: { employeeId },
          include: { department: true },
        }),
        tx.user.findUnique({
          where: { lineUserId },
          select: { role: true, departmentId: true, employeeId: true },
        }),
      ]);

      if (!targetEmployee || !actionUser) {
        throw new AppError({
          code: ErrorCode.USER_NOT_FOUND,
          message: 'Employee or admin user not found',
        });
      }

      // Check permissions
      if (
        !['SuperAdmin', 'Admin'].includes(actionUser.role) ||
        (actionUser.role === 'Admin' &&
          actionUser.departmentId &&
          targetEmployee.departmentId !== actionUser.departmentId)
      ) {
        throw new AppError({
          code: ErrorCode.UNAUTHORIZED,
          message: "Unauthorized to modify this employee's attendance",
        });
      }

      const targetDate = startOfDay(parseISO(date));

      // Get shift data
      const shiftData = await services.shiftService.getEffectiveShiftAndStatus(
        employeeId,
        targetDate,
      );

      if (!shiftData?.effectiveShift) {
        throw new AppError({
          code: ErrorCode.SHIFT_NOT_FOUND,
          message: 'No shift found for this date',
        });
      }

      // Get overtime request if needed
      let overtimeRequest = null;
      if (periodType === PeriodType.OVERTIME || overtimeRequestId) {
        overtimeRequest = await tx.overtimeRequest.findFirst({
          where: {
            id: overtimeRequestId,
            employeeId,
            date: targetDate,
            status: 'approved',
          },
        });

        if (!overtimeRequest) {
          throw new AppError({
            code: ErrorCode.INVALID_INPUT,
            message: 'No approved overtime request found',
          });
        }
      }

      // Create or update base attendance record first
      const attendance = await tx.attendance.upsert({
        where: {
          employee_date_attendance: {
            employeeId,
            date: targetDate,
          },
        },
        create: {
          employeeId,
          date: targetDate,
          state: AttendanceState.PRESENT,
          checkStatus:
            checkInTime && checkOutTime
              ? CheckStatus.CHECKED_OUT
              : checkInTime
                ? CheckStatus.CHECKED_IN
                : CheckStatus.PENDING,
          isManualEntry: true,
          CheckInTime: checkInTime ? parseISO(`${date}T${checkInTime}`) : null,
          CheckOutTime: checkOutTime
            ? parseISO(`${date}T${checkOutTime}`)
            : null,
          shiftStartTime: parseISO(
            `${date}T${shiftData.effectiveShift.startTime}`,
          ),
          shiftEndTime: parseISO(`${date}T${shiftData.effectiveShift.endTime}`),
          isDayOff: !shiftData.effectiveShift.workDays.includes(
            targetDate.getDay(),
          ),
          checkInReason: reason,
          version: 1,
        },
        update: {
          CheckInTime: checkInTime
            ? parseISO(`${date}T${checkInTime}`)
            : undefined,
          CheckOutTime: checkOutTime
            ? parseISO(`${date}T${checkOutTime}`)
            : undefined,
          state: AttendanceState.PRESENT,
          checkStatus:
            checkInTime && checkOutTime
              ? CheckStatus.CHECKED_OUT
              : checkInTime
                ? CheckStatus.CHECKED_IN
                : CheckStatus.PENDING,
          isManualEntry: true,
          checkInReason: reason,
          version: { increment: 1 },
        },
      });

      // Create break times based on shift data
      const calculateBreakTimes = (date: string) => {
        const shiftStart = parseISO(
          `${date}T${shiftData.effectiveShift.startTime}`,
        );
        const breakStart = addHours(shiftStart, 4); // Break after 4 hours
        const breakEnd = addMinutes(breakStart, 60); // 1 hour break
        return { breakStart, breakEnd };
      };

      // Calculate hours for time entry
      const calculateHours = async (
        services: any,
        {
          checkInTime,
          checkOutTime,
          date,
          shiftData,
          overtimeRequest,
          periodType,
        }: {
          checkInTime: string | null;
          checkOutTime: string | null;
          date: string;
          shiftData: any;
          overtimeRequest: any;
          periodType: PeriodType;
        },
      ) => {
        const { breakStart, breakEnd } = calculateBreakTimes(date);
        const checkInDateTime = checkInTime
          ? parseISO(`${date}T${checkInTime}`)
          : null;
        const checkOutDateTime = checkOutTime
          ? parseISO(`${date}T${checkOutTime}`)
          : null;

        if (!checkInDateTime || !checkOutDateTime) {
          return { regularHours: 0, overtimeHours: 0 };
        }

        const workingHours = services.timeEntryService.calculateWorkingHours(
          checkInDateTime,
          checkOutDateTime,
          parseISO(`${date}T${shiftData.effectiveShift.startTime}`),
          parseISO(`${date}T${shiftData.effectiveShift.endTime}`),
          overtimeRequest,
          [], // Empty leave requests array
        );

        return {
          regularHours:
            periodType === PeriodType.REGULAR ? workingHours.regularHours : 0,
          overtimeHours:
            periodType === PeriodType.OVERTIME ? workingHours.overtimeHours : 0,
        };
      };

      // In the transaction, update the overtime entry creation:
      if (periodType === PeriodType.OVERTIME && overtimeRequest) {
        await tx.overtimeEntry.upsert({
          where: {
            id: `${attendance.id}-${overtimeRequest.id}`,
          },
          create: {
            id: `${attendance.id}-${overtimeRequest.id}`,
            attendance: { connect: { id: attendance.id } },
            overtimeRequest: { connect: { id: overtimeRequest.id } },
            actualStartTime: checkInTime
              ? parseISO(`${date}T${checkInTime}`)
              : '',
            actualEndTime: checkOutTime
              ? parseISO(`${date}T${checkOutTime}`)
              : undefined,
          },
          update: {
            actualStartTime: checkInTime
              ? parseISO(`${date}T${checkInTime}`)
              : undefined,
            actualEndTime: checkOutTime
              ? parseISO(`${date}T${checkOutTime}`)
              : undefined,
          },
        });
      }

      // Calculate hours
      const hours = await calculateHours(services, {
        checkInTime,
        checkOutTime,
        date,
        shiftData,
        overtimeRequest,
        periodType,
      });

      // Create or update time entry
      await tx.timeEntry.upsert({
        where: {
          id: `${attendance.id}-${periodType}`,
        },
        create: {
          id: `${attendance.id}-${periodType}`,
          employeeId,
          attendanceId: attendance.id,
          date: targetDate,
          entryType: periodType,
          regularHours: hours.regularHours,
          overtimeHours: hours.overtimeHours,
          status: checkOutTime
            ? TimeEntryStatus.COMPLETED
            : TimeEntryStatus.IN_PROGRESS,
          startTime: checkInTime
            ? parseISO(`${date}T${checkInTime}`)
            : targetDate,
          endTime: checkOutTime ? parseISO(`${date}T${checkOutTime}`) : null,
          ...(periodType === PeriodType.OVERTIME &&
            overtimeRequest && {
              overtimeMetadata: {
                create: {
                  isDayOffOvertime: overtimeRequest.isDayOffOvertime,
                  isInsideShiftHours: overtimeRequest.isInsideShiftHours,
                },
              },
            }),
        },
        update: {
          status: checkOutTime
            ? TimeEntryStatus.COMPLETED
            : TimeEntryStatus.IN_PROGRESS,
          regularHours: hours.regularHours,
          overtimeHours: hours.overtimeHours,
          startTime: checkInTime
            ? parseISO(`${date}T${checkInTime}`)
            : undefined,
          endTime: checkOutTime ? parseISO(`${date}T${checkOutTime}`) : null,
          ...(periodType === PeriodType.OVERTIME &&
            overtimeRequest && {
              overtimeMetadata: {
                upsert: {
                  create: {
                    isDayOffOvertime: overtimeRequest.isDayOffOvertime,
                    isInsideShiftHours: overtimeRequest.isInsideShiftHours,
                  },
                  update: {
                    isDayOffOvertime: overtimeRequest.isDayOffOvertime,
                    isInsideShiftHours: overtimeRequest.isInsideShiftHours,
                  },
                },
              },
            }),
        },
      });

      // Process through attendance service
      if (checkInTime) {
        await attendanceService.processAttendance({
          employeeId,
          lineUserId,
          checkTime: `${date}T${checkInTime}`,
          isCheckIn: true,
          entryType: periodType,
          isManualEntry: true,
          isOvertime: periodType === PeriodType.OVERTIME,
          overtimeRequestId: overtimeRequest?.id,
          reason,
          state: AttendanceState.PRESENT,
          checkStatus: CheckStatus.CHECKED_IN,
          overtimeState:
            periodType === PeriodType.OVERTIME
              ? OvertimeState.IN_PROGRESS
              : undefined,
          updatedBy: actionUser.employeeId,
          metadata: {
            source: 'manual',
            reasonType,
            originalRequest: req.body,
          },
        });
      }

      if (checkOutTime) {
        await attendanceService.processAttendance({
          employeeId,
          lineUserId,
          checkTime: `${date}T${checkOutTime}`,
          isCheckIn: false,
          entryType: periodType,
          isManualEntry: true,
          isOvertime: periodType === PeriodType.OVERTIME,
          overtimeRequestId: overtimeRequest?.id,
          reason,
          state: AttendanceState.PRESENT,
          checkStatus: CheckStatus.CHECKED_OUT,
          overtimeState:
            periodType === PeriodType.OVERTIME
              ? OvertimeState.COMPLETED
              : undefined,
          updatedBy: actionUser.employeeId,
          metadata: {
            source: 'manual',
            reasonType,
            originalRequest: req.body,
          },
        });
      }

      // Send notifications
      if (targetEmployee.lineUserId) {
        await services.notificationService.sendNotification(
          targetEmployee.employeeId,
          targetEmployee.lineUserId,
          `Your attendance record for ${format(targetDate, 'dd/MM/yyyy')} has been updated by admin.
          Type: ${periodType === PeriodType.OVERTIME ? 'Overtime' : 'Regular'}
          Reason: ${reason}`,
          'attendance',
        );
      }

      // Get final attendance status
      const updatedStatus =
        await attendanceService.getLatestAttendanceStatus(employeeId);

      const finalAttendance = await tx.attendance.findUnique({
        where: { id: attendance.id },
        include: {
          overtimeEntries: true,
          timeEntries: {
            include: { overtimeMetadata: true },
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Attendance record updated successfully',
        data: {
          status: updatedStatus,
          attendance: {
            ...finalAttendance,
            CheckInTime: finalAttendance?.CheckInTime
              ? format(finalAttendance.CheckInTime, 'HH:mm')
              : null,
            CheckOutTime: finalAttendance?.CheckOutTime
              ? format(finalAttendance.CheckOutTime, 'HH:mm')
              : null,
          },
        },
      });
    });
  } catch (error) {
    console.error('Error in manual entry:', error);

    if (error instanceof AppError) {
      return res
        .status(error.code === ErrorCode.UNAUTHORIZED ? 403 : 400)
        .json({
          success: false,
          message: error.message,
          code: error.code,
        });
    }

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to process manual entry',
      code: ErrorCode.INTERNAL_ERROR,
    });
  }
}

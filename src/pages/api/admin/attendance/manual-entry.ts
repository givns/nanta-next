import type { NextApiRequest, NextApiResponse } from 'next';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
  TimeEntryStatus,
  PrismaClient,
} from '@prisma/client';
import { parseISO, startOfDay, format } from 'date-fns';
import { initializeServices } from '@/services/ServiceInitializer';
import { ErrorCode, AppError } from '@/types/attendance/error';
import { getCurrentTime } from '@/utils/dateUtils';
import { CacheManager } from '@/services/cache/CacheManager';
import { z } from 'zod';
import { EffectiveShift } from '@/types/attendance';

// Initialize Prisma client
const prisma = new PrismaClient();

// Define the services type
type InitializedServices = Awaited<ReturnType<typeof initializeServices>>;

// Initialize CacheManager once
let cacheManager = CacheManager.getInstance();

// Cache the services initialization promise
let servicesPromise: Promise<InitializedServices> | null = null;

// Define request body schema
const RequestSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  checkInTime: z.string().nullable(),
  checkOutTime: z.string().nullable(),
  reason: z.string(),
  periodType: z.nativeEnum(PeriodType),
  reasonType: z.string(),
  overtimeRequestId: z.string().optional(),
});

// Types for working hours calculation
interface WorkingHours {
  regularHours: number;
  overtimeHours: number;
}

interface CalculateHoursParams {
  checkInTime: string | null;
  checkOutTime: string | null;
  date: string;
  shiftData: EffectiveShift;
  overtimeRequest: any | null;
  periodType: PeriodType;
}

// Initialize services once
const getServices = async (): Promise<InitializedServices> => {
  if (!servicesPromise) {
    servicesPromise = initializeServices(prisma);
  }

  const services = await servicesPromise;
  if (!services) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to initialize services',
    });
  }

  // Update cacheManager reference if needed
  if (!cacheManager) {
    cacheManager = CacheManager.getInstance();
  }

  return services;
};

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
    // Initialize services with proper typing
    const services = await getServices();
    const {
      attendanceService,
      notificationService,
      timeEntryService,
      shiftService,
    } = services;

    // Validate services
    if (
      !attendanceService ||
      !notificationService ||
      !timeEntryService ||
      !shiftService
    ) {
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Required services not initialized',
      });
    }

    // Validate request body
    const validatedData = RequestSchema.parse(req.body);
    const {
      employeeId,
      date,
      checkInTime,
      checkOutTime,
      reason,
      periodType,
      reasonType,
      overtimeRequestId,
    } = validatedData;

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
      const shiftData = await services.shiftService.getEffectiveShift(
        employeeId,
        targetDate,
      );

      if (!shiftData) {
        throw new AppError({
          code: ErrorCode.SHIFT_NOT_FOUND,
          message: 'No shift found for this date',
        });
      }

      // Get overtime request if needed
      let overtimeRequest = null;
      if (periodType === PeriodType.OVERTIME && overtimeRequestId) {
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

      // Find existing record for this period type to get the sequence
      const existingAttendance = await tx.attendance.findFirst({
        where: {
          employeeId,
          date: targetDate,
          type: periodType,
        },
        orderBy: {
          periodSequence: 'desc',
        },
      });

      const nextSequence = existingAttendance
        ? existingAttendance.periodSequence + 1
        : 1;

      // Create or update base attendance record
      const attendance = await tx.attendance.upsert({
        where: {
          employee_date_period_sequence: {
            employeeId,
            date: targetDate,
            type: periodType,
            periodSequence: existingAttendance?.periodSequence || 1,
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
          type: periodType,
          periodSequence: nextSequence,
          createdAt: new Date(),
          isOvertime: periodType === PeriodType.OVERTIME,
          overtimeState:
            periodType === PeriodType.OVERTIME
              ? OvertimeState.NOT_STARTED
              : null,
          CheckInTime: checkInTime ? parseISO(`${date}T${checkInTime}`) : null,
          CheckOutTime: checkOutTime
            ? parseISO(`${date}T${checkOutTime}`)
            : null,
          shiftStartTime: parseISO(`${date}T${shiftData.current.startTime}`),
          shiftEndTime: parseISO(`${date}T${shiftData.current.endTime}`),
          checkTiming: {
            create: {
              isEarlyCheckIn: false,
              isLateCheckIn: false,
              isLateCheckOut: false,
              isVeryLateCheckOut: false,
              lateCheckOutMinutes: 0,
            },
          },
          location: {
            create: {
              checkInAddress: '',
              checkOutAddress: '',
              checkInCoordinates: { lat: 0, lng: 0, longitude: 0, latitude: 0 },
              checkOutCoordinates: {
                lat: 0,
                lng: 0,
                longitude: 0,
                latitude: 0,
              },
            },
          },
          metadata: {
            create: {
              isManualEntry: true,
              isDayOff: !shiftData.current.workDays.includes(
                targetDate.getDay(),
              ),
              source: 'manual',
            },
          },
        },
        update: {
          CheckInTime: checkInTime
            ? parseISO(`${date}T${checkInTime}`)
            : undefined,
          CheckOutTime: checkOutTime
            ? parseISO(`${date}T${checkOutTime}`)
            : undefined,
          state: AttendanceState.PRESENT,
          type: periodType,
          isOvertime: periodType === PeriodType.OVERTIME,
          overtimeState:
            periodType === PeriodType.OVERTIME
              ? checkOutTime
                ? OvertimeState.COMPLETED
                : OvertimeState.IN_PROGRESS
              : null,
          checkStatus:
            checkInTime && checkOutTime
              ? CheckStatus.CHECKED_OUT
              : checkInTime
                ? CheckStatus.CHECKED_IN
                : CheckStatus.PENDING,
          checkTiming: {
            upsert: {
              create: {
                isEarlyCheckIn: false,
                isLateCheckIn: false,
                isLateCheckOut: false,
                isVeryLateCheckOut: false,
                lateCheckOutMinutes: 0,
              },
              update: {
                isEarlyCheckIn: false,
                isLateCheckIn: false,
                isLateCheckOut: false,
                isVeryLateCheckOut: false,
                lateCheckOutMinutes: 0,
              },
            },
          },
          metadata: {
            upsert: {
              create: {
                isManualEntry: true,
                isDayOff: !shiftData.current.workDays.includes(
                  targetDate.getDay(),
                ),
                source: 'manual',
              },
              update: {
                isManualEntry: true,
                isDayOff: !shiftData.current.workDays.includes(
                  targetDate.getDay(),
                ),
                source: 'manual',
              },
            },
          },
        },
        include: {
          checkTiming: true,
          location: true,
          metadata: true,
        },
      });

      // Calculate hours for time entry
      const calculateHours = async ({
        checkInTime,
        checkOutTime,
        date,
        shiftData,
        overtimeRequest,
        periodType,
      }: CalculateHoursParams): Promise<WorkingHours> => {
        if (!checkInTime || !checkOutTime) {
          return { regularHours: 0, overtimeHours: 0 };
        }

        const workingHours = timeEntryService.calculateWorkingHours(
          parseISO(`${date}T${checkInTime}`),
          parseISO(`${date}T${checkOutTime}`),
          parseISO(`${date}T${shiftData.current.startTime}`),
          parseISO(`${date}T${shiftData.current.endTime}`),
          overtimeRequest,
          [],
        );

        return {
          regularHours:
            periodType === PeriodType.REGULAR ? workingHours.regularHours : 0,
          overtimeHours:
            periodType === PeriodType.OVERTIME ? workingHours.overtimeHours : 0,
        };
      };

      // Calculate hours
      const hours = await calculateHours({
        checkInTime,
        checkOutTime,
        date,
        shiftData,
        overtimeRequest,
        periodType,
      });

      // Create or update time entry
      const timeEntryResult = await tx.timeEntry.upsert({
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
            : TimeEntryStatus.STARTED,
          startTime: checkInTime
            ? parseISO(`${date}T${checkInTime}`)
            : targetDate,
          endTime: checkOutTime ? parseISO(`${date}T${checkOutTime}`) : null,
          hours: { regular: hours.regularHours, overtime: hours.overtimeHours },
          timing: {
            actualMinutesLate: 0,
            isHalfDayLate: false,
          },
          metadata: {
            source: 'manual',
            version: 1,
            createdAt: getCurrentTime().toISOString(),
            updatedAt: getCurrentTime().toISOString(),
          },
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
            : TimeEntryStatus.STARTED,
          regularHours: hours.regularHours,
          overtimeHours: hours.overtimeHours,
          startTime: checkInTime
            ? parseISO(`${date}T${checkInTime}`)
            : undefined,
          endTime: checkOutTime ? parseISO(`${date}T${checkOutTime}`) : null,
          hours: { regular: hours.regularHours, overtime: hours.overtimeHours },
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
        include: {
          overtimeMetadata: true,
        },
      });

      console.log('Created/Updated time entry:', timeEntryResult.id);

      // Update overtime entry if needed
      if (periodType === PeriodType.OVERTIME && overtimeRequest) {
        const overtimeEntryId = `${attendance.id}-${overtimeRequest.id}`;

        await tx.overtimeEntry.upsert({
          where: {
            id: overtimeEntryId,
          },
          create: {
            id: overtimeEntryId,
            attendanceId: attendance.id,
            overtimeRequestId: overtimeRequest.id,
            actualStartTime: checkInTime
              ? parseISO(`${date}T${checkInTime}`)
              : null,
            actualEndTime: checkOutTime
              ? parseISO(`${date}T${checkOutTime}`)
              : null,
          },
          update: {
            actualStartTime: checkInTime
              ? parseISO(`${date}T${checkInTime}`)
              : null,
            actualEndTime: checkOutTime
              ? parseISO(`${date}T${checkOutTime}`)
              : null,
          },
        });
      }

      // Process through attendance service
      if (checkInTime) {
        await attendanceService.processAttendance({
          employeeId,
          lineUserId,
          checkTime: `${date}T${checkInTime}`,
          periodType,
          activity: {
            isCheckIn: true,
            isManualEntry: true,
            isOvertime: periodType === PeriodType.OVERTIME,
          },
          metadata: {
            overtimeId: overtimeRequest?.id,
            reason,
            source: 'manual',
            updatedBy: actionUser.employeeId,
          },
        });
      }

      if (checkOutTime) {
        await attendanceService.processAttendance({
          employeeId,
          lineUserId,
          checkTime: `${date}T${checkOutTime}`,
          periodType,
          activity: {
            isCheckIn: false,
            isManualEntry: true,
            isOvertime: periodType === PeriodType.OVERTIME,
          },
          metadata: {
            overtimeId: overtimeRequest?.id,
            reason,
            source: 'manual',
            updatedBy: actionUser.employeeId,
          },
        });
      }

      // Send notifications
      if (targetEmployee.lineUserId) {
        await notificationService.sendNotification(
          targetEmployee.employeeId,
          targetEmployee.lineUserId,
          `Your attendance record for ${format(targetDate, 'dd/MM/yyyy')} has been updated by admin.
          Type: ${periodType === PeriodType.OVERTIME ? 'Overtime' : 'Regular'}
          Reason: ${reason}`,
          'attendance',
        );
      }

      // Get final attendance status
      const updatedStatus = await attendanceService.getAttendanceStatus(
        employeeId,
        {
          inPremises: true,
          address: '',
        },
      );

      const finalAttendance = await tx.attendance.findUnique({
        where: { id: attendance.id },
        include: {
          checkTiming: true,
          location: true,
          metadata: true,
          overtimeEntries: true,
          timeEntries: {
            include: {
              overtimeMetadata: true,
            },
          },
        },
      });

      // Clear cache
      if (cacheManager) {
        await cacheManager.invalidateCache(employeeId);
      } else {
        console.warn('CacheManager not available for cache invalidation');
      }

      return res.status(200).json({
        success: true,
        message: 'Attendance record updated successfully',
        data: {
          status: updatedStatus,
          attendance: finalAttendance
            ? {
                ...finalAttendance,
                CheckInTime: finalAttendance.CheckInTime
                  ? format(finalAttendance.CheckInTime, 'HH:mm')
                  : null,
                CheckOutTime: finalAttendance.CheckOutTime
                  ? format(finalAttendance.CheckOutTime, 'HH:mm')
                  : null,
              }
            : null,
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

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request parameters',
        code: ErrorCode.INVALID_INPUT,
        details: error.format(),
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
  } finally {
    await prisma.$disconnect();
  }
}

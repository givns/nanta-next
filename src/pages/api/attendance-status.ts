// pages/api/attendance-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { HolidayService } from '@/services/HolidayService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { cacheService } from '@/services/CacheService';
import { ResponseDataSchema } from '../../schemas/attendance';
import { ZodError, z } from 'zod';
import {
  ApprovedOvertime,
  AttendanceStatusInfo,
  OvertimeAttendanceInfo,
} from '@/types/attendance';
import {
  addDays,
  endOfDay,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
} from 'date-fns';

const processOvertimeAttendances = async (
  overtimeRequests: ApprovedOvertime[],
  employeeId: string,
  attendanceService: AttendanceService,
  currentTime: Date,
) => {
  return Promise.all(
    overtimeRequests.map(async (overtime) => {
      const attendance = await prisma.attendance.findFirst({
        where: {
          employeeId,
          date: {
            gte: startOfDay(overtime.date),
            lt: endOfDay(overtime.date),
          },
        },
        include: {
          overtimeEntries: {
            where: { overtimeRequestId: overtime.id },
          },
        },
      });

      const overtimeEntry = attendance?.overtimeEntries[0];

      // Determine overtime status
      const start = parseISO(
        `${format(currentTime, 'yyyy-MM-dd')}T${overtime.startTime}`,
      );
      let end = parseISO(
        `${format(currentTime, 'yyyy-MM-dd')}T${overtime.endTime}`,
      );

      if (end < start) {
        end = addDays(end, 1);
      }

      const periodStatus = {
        isPending: currentTime < start,
        isActive: isWithinInterval(currentTime, { start, end }),
        isNext: currentTime < start && !attendance?.regularCheckInTime,
        isComplete: !!attendance?.regularCheckOutTime,
      };

      return {
        overtimeRequest: overtime,
        attendance: attendance
          ? {
              checkInTime: attendance.regularCheckInTime
                ? format(attendance.regularCheckInTime, 'HH:mm:ss')
                : null,
              checkOutTime: attendance.regularCheckOutTime
                ? format(attendance.regularCheckOutTime, 'HH:mm:ss')
                : null,
              status: attendance.status,
            }
          : null,
        periodStatus,
      };
    }),
  );
};

// Initialize Services
const prisma = new PrismaClient();
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

// User Data Preparation
const prepareUserData = (user: any) => {
  return {
    id: user.id || user.employeeId,
    employeeId: user.employeeId,
    name: user.name,
    lineUserId: user.lineUserId,
    nickname: user.nickname,
    departmentId: user.departmentId,
    departmentName: user.departmentName || user.department?.name || '',
    role: user.role,
    company: user.company || 'default',
    employeeType: user.employeeType || 'Fulltime',
    isGovernmentRegistered: user.isGovernmentRegistered || 'false',
    profilePictureUrl: user.profilePictureUrl,
    shiftId: user.shiftId,
    shiftCode: user.shiftCode,
    overtimeHours: user.overtimeHours || 0,
    sickLeaveBalance: user.sickLeaveBalance || 0,
    businessLeaveBalance: user.businessLeaveBalance || 0,
    annualLeaveBalance: user.annualLeaveBalance || 0,
    isPreImported: user.isPreImported || 'false',
    isRegistrationComplete: user.isRegistrationComplete || 'true',
    updatedAt: user.updatedAt ? new Date(user.updatedAt) : null,
  };
};

// Initial Attendance Status Creation
const createInitialAttendanceStatus = async (
  userId: string,
  preparedUser: any,
): Promise<AttendanceStatusInfo> => {
  const now = new Date();
  const currentShift = await shiftService.getEffectiveShiftAndStatus(
    userId,
    now,
  );

  return {
    isDayOff: !currentShift?.effectiveShift?.workDays.includes(now.getDay()),
    isHoliday: false,
    holidayInfo: null,
    dayOffType: 'none',
    status: 'absent',
    isCheckingIn: true,
    isOvertime: false,
    overtimeDuration: 0,
    overtimeEntries: [],
    detailedStatus: 'first-time',
    isEarlyCheckIn: false,
    isLateCheckIn: false,
    isLateCheckOut: false,
    user: {
      ...preparedUser,
      updatedAt: preparedUser.updatedAt ?? undefined,
    },
    latestAttendance: null,
    shiftAdjustment: null,
    approvedOvertime: null,
    futureShifts: [],
    futureOvertimes: [],
    pendingLeaveRequest: false,
    overtimeAttendances: [],
    currentPeriod: {
      type: 'regular',
      isComplete: false,
    },
  };
};

// Main API Handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { employeeId, lineUserId, inPremises, address, forceRefresh } =
    req.query;

  try {
    // User Data Fetching
    let user = await (async () => {
      if (lineUserId && typeof lineUserId === 'string') {
        const cacheKey = `user:${lineUserId}`;
        const cachedUser = cacheService
          ? await cacheService.get(cacheKey)
          : null;

        if (cachedUser) {
          return JSON.parse(cachedUser);
        }

        const user = await prisma.user.findUnique({
          where: { lineUserId },
          include: { department: true },
        });

        if (user && cacheService) {
          await cacheService.set(cacheKey, JSON.stringify(user), 3600);
        }

        return user;
      }

      if (employeeId && typeof employeeId === 'string') {
        return prisma.user.findUnique({
          where: { employeeId },
          include: { department: true },
        });
      }

      return null;
    })();

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Please complete your registration first.',
      });
    }

    const preparedUser = prepareUserData(user);
    const currentTime = new Date();

    // Data Fetching
    const cacheKey = `attendance-status:${user.lineUserId || user.employeeId}`;
    try {
      const fetchAttendanceData = async () => {
        const [shiftData, attendanceStatus, overtimeRequest, leaveRequests] =
          await Promise.all([
            shiftService.getEffectiveShiftAndStatus(
              preparedUser.employeeId,
              currentTime,
            ),
            attendanceService
              .getLatestAttendanceStatus(preparedUser.employeeId)
              .catch(() =>
                createInitialAttendanceStatus(
                  preparedUser.employeeId,
                  preparedUser,
                ),
              ),
            overtimeService.getApprovedOvertimeRequest(
              preparedUser.employeeId,
              currentTime,
            ),
            leaveServiceServer.getLeaveRequests(preparedUser.employeeId),
          ]);

        // Get all overtimes including the current one
        const allOvertimes = overtimeRequest ? [overtimeRequest] : [];

        const overtimeAttendances = await processOvertimeAttendances(
          allOvertimes,
          preparedUser.employeeId,
          attendanceService,
          currentTime,
        );

        // Find active overtime
        const activeOvertime = overtimeAttendances.find(
          (ot) => ot.periodStatus.isActive,
        );

        // Determine current period
        const currentPeriod = activeOvertime
          ? {
              type: 'overtime' as const,
              overtimeId: activeOvertime.overtimeRequest.id,
              isComplete: activeOvertime.periodStatus.isComplete,
            }
          : {
              type: 'regular' as const,
              isComplete: !!attendanceStatus.latestAttendance?.checkOutTime,
            };

        return {
          shiftData,
          attendanceStatus: {
            ...attendanceStatus,
            overtimeAttendances,
            currentPeriod,
          },
          approvedOvertime: activeOvertime?.overtimeRequest || null,
          leaveRequests,
        };
      };

      let responseData;
      if (cacheService && !forceRefresh) {
        responseData = await cacheService.getWithSWR(
          cacheKey,
          fetchAttendanceData,
          300,
        );
      } else {
        responseData = await fetchAttendanceData();
      }

      // Get check-in/out allowance with proper date formatting
      const checkInOutAllowance = await attendanceService.isCheckInOutAllowed(
        preparedUser.employeeId,
        inPremises === 'true',
        address as string,
      );

      // Format dates for Zod validation
      const formattedCheckInOutAllowance = {
        ...checkInOutAllowance,
        actualStartTime: checkInOutAllowance.actualStartTime || undefined,
        actualEndTime: checkInOutAllowance.actualEndTime || undefined,
        plannedStartTime: checkInOutAllowance.plannedStartTime || undefined,
        plannedEndTime: checkInOutAllowance.plannedEndTime || undefined,
        maxCheckOutTime: checkInOutAllowance.maxCheckOutTime || undefined,
        periodType: responseData.attendanceStatus.currentPeriod.type,
        overtimeId:
          responseData.attendanceStatus.currentPeriod.type === 'overtime'
            ? responseData.attendanceStatus.currentPeriod.overtimeId
            : undefined,
      };

      // Ensure all required fields are present
      const finalResponseData = {
        user: preparedUser,
        attendanceStatus: responseData.attendanceStatus || null,
        effectiveShift: responseData.shiftData?.effectiveShift || null,
        checkInOutAllowance: formattedCheckInOutAllowance,
        approvedOvertime: responseData.approvedOvertime || null,
        leaveRequests: responseData.leaveRequests || [],
      };

      // Try validating with safe parse first to get detailed errors
      const validationResult = ResponseDataSchema.safeParse(finalResponseData);

      if (!validationResult.success) {
        console.error('Validation errors:', {
          issues: validationResult.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
            code: issue.code,
          })),
        });

        // Use fallback response
        const fallbackData = await createFallbackResponse(
          preparedUser,
          currentTime,
        );
        return res.status(200).json(fallbackData);
      }

      return res.status(200).json(validationResult.data);
    } catch (error) {
      console.error('Error in data processing:', error);
      const fallbackData = await createFallbackResponse(
        preparedUser,
        currentTime,
      );
      return res.status(200).json(fallbackData);
    }
  } catch (error) {
    console.error('Unexpected error in attendance-status API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error instanceof Error ? error.stack : undefined,
      }),
    });
  } finally {
    await prisma.$disconnect();
  }

  // Add fallback response creator
  async function createFallbackResponse(user: any, currentTime: Date) {
    const initialStatus = await createInitialAttendanceStatus(
      user.employeeId,
      user,
    );

    return {
      user,
      attendanceStatus: initialStatus,
      effectiveShift: {
        id: 'default',
        name: 'Default Shift',
        shiftCode: 'DEFAULT',
        startTime: '08:00',
        endTime: '17:00',
        workDays: [1, 2, 3, 4, 5],
      },
      checkInOutAllowance: {
        allowed: false,
        reason: 'System error occurred',
        inPremises: false,
        address: '',
        periodType: 'regular' as const,
      },
      approvedOvertime: null,
      leaveRequests: [],
    };
  }
}

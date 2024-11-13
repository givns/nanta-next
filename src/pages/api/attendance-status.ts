// pages/api/attendance-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';
import { z } from 'zod';
import { AttendanceService } from '@/services/AttendanceService';
import { HolidayService } from '@/services/HolidayService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { cacheService } from '@/services/CacheService';
import { ResponseDataSchema } from '@/schemas/attendance';
import { AttendanceStatusInfo } from '@/types/attendance';

// Initialize Prisma Client
const prisma = new PrismaClient();

// Initialize all services
const initializeServices = () => {
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

  // Set overtime service in shift service
  shiftService.setOvertimeService(overtimeService);

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

  return {
    attendanceService,
    shiftService,
    overtimeService,
    leaveServiceServer,
  };
};

// Helper functions
const prepareUserData = (user: any) => ({
  employeeId: user.employeeId,
  name: user.name,
  lineUserId: user.lineUserId,
  nickname: user.nickname || null,
  departmentName: user.departmentName || user.department?.name || '',
  role: user.role,
  profilePictureUrl: user.profilePictureUrl || null,
  shiftId: user.shiftId || null,
  shiftCode: user.shiftCode || null,
  sickLeaveBalance: user.sickLeaveBalance || 0,
  businessLeaveBalance: user.businessLeaveBalance || 0,
  annualLeaveBalance: user.annualLeaveBalance || 0,
  updatedAt: user.updatedAt ? new Date(user.updatedAt) : null,
  company: user.company || 'default',
  employeeType: user.employeeType || 'Fulltime',
  isGovernmentRegistered: user.isGovernmentRegistered || 'false',
  isPreImported: user.isPreImported || 'false',
  isRegistrationComplete: user.isRegistrationComplete || 'true',
});

const transformDatesToISOString = (data: any) => {
  if (!data) return data;

  const dateFields = [
    'actualStartTime',
    'actualEndTime',
    'plannedStartTime',
    'plannedEndTime',
    'maxCheckOutTime',
  ];

  return {
    ...data,
    ...Object.fromEntries(
      dateFields.map((field) => [
        field,
        data[field] instanceof Date ? data[field].toISOString() : data[field],
      ]),
    ),
  };
};

const createInitialAttendanceStatus = async (
  userId: string,
  shiftService: ShiftManagementService,
  userData: any,
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
    user: userData,
    latestAttendance: null,
    shiftAdjustment: null,
    approvedOvertime: null,
    futureShifts: [],
    futureOvertimes: [],
    pendingLeaveRequest: false,
  };
};

const prepareResponseForValidation = (data: any) => {
  return {
    ...data,
    checkInOutAllowance: transformDatesToISOString(data.checkInOutAllowance),
    attendanceStatus: data.attendanceStatus
      ? {
          ...data.attendanceStatus,
          latestAttendance: data.attendanceStatus.latestAttendance
            ? {
                ...data.attendanceStatus.latestAttendance,
                date:
                  typeof data.attendanceStatus.latestAttendance.date ===
                  'string'
                    ? data.attendanceStatus.latestAttendance.date
                    : format(
                        data.attendanceStatus.latestAttendance.date,
                        'yyyy-MM-dd',
                      ),
              }
            : null,
        }
      : null,
  };
};

// Query parameters validation schema
const QuerySchema = z.object({
  employeeId: z.string().optional(),
  lineUserId: z.string().optional(),
  inPremises: z.string().transform((val) => val === 'true'),
  address: z.string().optional(),
  forceRefresh: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

// Main handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('Attendance Status API Request:', {
    query: req.query,
    timestamp: new Date().toISOString(),
  });

  try {
    // Validate query parameters
    const query = QuerySchema.parse(req.query);

    // Initialize services
    const services = initializeServices();

    // Fetch user
    let user;
    try {
      if (query.lineUserId) {
        const cacheKey = `user:${query.lineUserId}`;
        user = await cacheService
          ?.get(cacheKey)
          .then((cached) => (cached ? JSON.parse(cached) : null))
          .catch(() => null);

        if (!user) {
          user = await prisma.user.findUnique({
            where: { lineUserId: query.lineUserId },
            include: { department: true },
          });
          if (user && cacheService) {
            await cacheService.set(cacheKey, JSON.stringify(user), 3600);
          }
        }
      } else if (query.employeeId) {
        user = await prisma.user.findUnique({
          where: { employeeId: query.employeeId },
          include: { department: true },
        });
      }

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Please complete your registration first.',
        });
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({
        error: 'Failed to fetch user data',
        message: 'Unable to retrieve user information.',
      });
    }

    // Prepare user data
    const preparedUser = prepareUserData(user);

    // Fetch attendance data
    const cacheKey = `attendance-status:${user.lineUserId || user.employeeId}`;
    let responseData;

    try {
      if (cacheService && !query.forceRefresh) {
        responseData = await cacheService.getWithSWR(
          cacheKey,
          async () => {
            const [
              shiftData,
              attendanceStatus,
              approvedOvertime,
              leaveRequests,
            ] = await Promise.all([
              services.shiftService.getEffectiveShiftAndStatus(
                preparedUser.employeeId,
                new Date(),
              ),
              services.attendanceService
                .getLatestAttendanceStatus(preparedUser.employeeId)
                .catch(() =>
                  createInitialAttendanceStatus(
                    preparedUser.employeeId,
                    services.shiftService,
                    preparedUser,
                  ),
                ),
              services.overtimeService
                .getApprovedOvertimeRequest(preparedUser.employeeId, new Date())
                .catch(() => null),
              services.leaveServiceServer
                .getLeaveRequests(preparedUser.employeeId)
                .catch(() => []),
            ]);

            return {
              shiftData,
              attendanceStatus,
              approvedOvertime,
              leaveRequests,
            };
          },
          300,
        );
      } else {
        responseData = await Promise.all([
          services.shiftService.getEffectiveShiftAndStatus(
            preparedUser.employeeId,
            new Date(),
          ),
          services.attendanceService.getLatestAttendanceStatus(
            preparedUser.employeeId,
          ),
          services.overtimeService.getApprovedOvertimeRequest(
            preparedUser.employeeId,
            new Date(),
          ),
          services.leaveServiceServer.getLeaveRequests(preparedUser.employeeId),
        ]).then(
          ([shiftData, attendanceStatus, approvedOvertime, leaveRequests]) => ({
            shiftData,
            attendanceStatus,
            approvedOvertime,
            leaveRequests,
          }),
        );
      }
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      responseData = {
        shiftData: await services.shiftService.getEffectiveShiftAndStatus(
          preparedUser.employeeId,
          new Date(),
        ),
        attendanceStatus: await createInitialAttendanceStatus(
          preparedUser.employeeId,
          services.shiftService,
          preparedUser,
        ),
        approvedOvertime: null,
        leaveRequests: [],
      };
    }

    // Get check-in/out allowance
    const checkInOutAllowance = await services.attendanceService
      .isCheckInOutAllowed(
        preparedUser.employeeId,
        query.inPremises,
        query.address || '',
      )
      .catch(() => ({
        allowed: false,
        reason: 'Unable to determine check-in/out permissions',
        inPremises: false,
        address: '',
      }));

    // Prepare and validate final response
    const finalResponseData = {
      user: preparedUser,
      attendanceStatus: responseData.attendanceStatus,
      effectiveShift: responseData.shiftData?.effectiveShift,
      checkInOutAllowance,
      approvedOvertime: responseData.approvedOvertime,
      leaveRequests: responseData.leaveRequests ?? [],
    };

    try {
      const dataForValidation = prepareResponseForValidation(finalResponseData);
      const validatedData = ResponseDataSchema.parse(dataForValidation);
      return res.status(200).json(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation Error:', error.errors);
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Unexpected error in attendance-status API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error instanceof Error ? error.stack : undefined,
      }),
    });
  }
}

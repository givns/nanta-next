// pages/api/attendance-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/Attendance/AttendanceService';
import { cacheService } from '../../services/CacheService';
import { ResponseDataSchema } from '../../schemas/attendance';

import { AppError, ErrorCode } from '@/types/attendance';
import { initializeServices } from '../../services/ServiceInitializer';

// Initialize services
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

// Main API Handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

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
    console.log('Current time in attendance-status:', currentTime);

    // Fetch attendance data using service
    const cacheKey = `attendance:${employeeId}`; // Use employeeId consistently

    const fetchAttendanceData = async () => {
      // Get attendance status (which includes overtime attendances)
      const [attendanceStatus, shiftData, leaveRequests] = await Promise.all([
        attendanceService.getLatestAttendanceStatus(preparedUser.employeeId),
        services.shiftService.getEffectiveShiftAndStatus(
          preparedUser.employeeId,
          currentTime,
        ),
        services.leaveService.getLeaveRequests(preparedUser.employeeId),
      ]);

      // Get check-in/out allowance
      const checkInOutAllowance = await attendanceService.isCheckInOutAllowed(
        preparedUser.employeeId,
        inPremises === 'true',
        address as string,
      );

      return {
        user: preparedUser,
        attendanceStatus,
        effectiveShift: shiftData?.effectiveShift || null,
        checkInOutAllowance: {
          ...checkInOutAllowance,
          periodType: attendanceStatus.currentPeriod?.type || 'regular',
          overtimeId:
            attendanceStatus.currentPeriod?.type === 'overtime'
              ? attendanceStatus.currentPeriod.overtimeId
              : undefined,
        },
        approvedOvertime: attendanceStatus.approvedOvertime,
        leaveRequests,
      };
    };

    // Handle caching
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

    // Validate before returning
    const validationResult = ResponseDataSchema.safeParse(responseData);
    if (!validationResult.success) {
      console.error('Validation errors:', validationResult.error);
      throw new Error('Invalid response data structure');
    }

    return validationResult.data;
  } catch (error) {
    console.error('Error in attendance-status:', error);

    if (error instanceof AppError) {
      return res
        .status(error.code === ErrorCode.USER_NOT_FOUND ? 404 : 400)
        .json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
    }

    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message:
        error instanceof Error ? error.message : 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error instanceof Error ? error.stack : undefined,
      }),
    });
  } finally {
    await prisma.$disconnect();
  }
}

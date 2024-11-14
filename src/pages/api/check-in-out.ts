import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '@/services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { AttendanceData, AttendanceStatusInfo } from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { getCurrentTime } from '@/utils/dateUtils';
import { z } from 'zod';
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';

// Constants
const PROCESS_TIMEOUT = 30000; // 30 seconds total
const QUEUE_TIMEOUT = 25000; // 25 seconds for queue processing
const MAX_RETRIES = 2;
const RETRY_DELAY = 2000;

// Initialize Services
const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
const leaveServiceServer = createLeaveServiceServer(
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

// Validation Schema
const checkInOutSchema = z
  .object({
    data: z
      .object({
        isManualEntry: z.boolean().default(false),
        isEarlyCheckOut: z.boolean().default(false),
        isLate: z.boolean().default(false),
        isOvertime: z.boolean().default(false),
        reason: z.string().default(''),
      })
      .default({}),
    employeeId: z.string().optional(),
    lineUserId: z.string().optional(),
    isCheckIn: z.boolean(),
    checkTime: z.string(),
    checkInAddress: z.string().optional(),
    checkOutAddress: z.string().optional(),
    reason: z.string().optional(),
    photo: z.string().optional(),
    inPremises: z.boolean(),
    address: z.string(),
    earlyCheckoutType: z.enum(['emergency', 'planned'] as const).optional(),
  })
  .refine(
    (data) => {
      return Boolean(data.employeeId || data.lineUserId);
    },
    {
      message: 'Either employeeId or lineUserId must be provided',
      path: ['identification'],
    },
  );

// Types
type CheckInOutRequest = z.infer<typeof checkInOutSchema>;

interface QueueResult {
  status: AttendanceStatusInfo;
  notificationSent: boolean;
  success: boolean; // Add this
}

// Initialize Queue
const checkInOutQueue = new BetterQueue<CheckInOutRequest, QueueResult>(
  async (task, cb) => {
    try {
      const result = await processCheckInOut(task);
      cb(null, result);
    } catch (error) {
      console.error('Queue task error:', error);
      cb(error as Error);
    }
  },
  {
    concurrent: 3,
    store: new MemoryStore(),
    maxTimeout: QUEUE_TIMEOUT,
    retryDelay: RETRY_DELAY,
    maxRetries: MAX_RETRIES,
  },
);

// Transform validated data to AttendanceData
function transformToAttendanceData(
  validatedData: CheckInOutRequest,
  user: { employeeId: string; lineUserId: string | null },
): AttendanceData {
  return {
    employeeId: user.employeeId,
    lineUserId: user.lineUserId,
    isCheckIn: validatedData.isCheckIn,
    checkTime: new Date(validatedData.checkTime).toISOString(),
    location: '',
    [validatedData.isCheckIn ? 'checkInAddress' : 'checkOutAddress']:
      validatedData.isCheckIn
        ? validatedData.checkInAddress || validatedData.address
        : validatedData.checkOutAddress || validatedData.address,
    reason: validatedData.data.reason || validatedData.reason || '',
    isOvertime: validatedData.data.isOvertime,
    isLate: validatedData.data.isLate,
    isEarlyCheckOut: validatedData.data.isEarlyCheckOut,
    earlyCheckoutType: validatedData.earlyCheckoutType,
    isManualEntry: validatedData.data.isManualEntry,
  };
}

// Processing Function
async function processCheckInOut(
  task: CheckInOutRequest,
): Promise<QueueResult> {
  console.log('Processing check-in/out task:', task);

  try {
    // Parse and validate input
    const validatedData = checkInOutSchema.parse(task);

    // Get user
    const user = validatedData.employeeId
      ? await prisma.user.findUnique({
          where: { employeeId: validatedData.employeeId },
        })
      : await prisma.user.findUnique({
          where: { lineUserId: validatedData.lineUserId },
        });

    if (!user) throw new Error('User not found');

    const now = getCurrentTime();

    // Transform to AttendanceData
    const attendanceData = transformToAttendanceData(validatedData, user);

    try {
      // Process attendance
      const processedAttendance =
        await attendanceService.processAttendance(attendanceData);
      // Add specific error type checking
      if (!processedAttendance) {
        throw new Error('Failed to process attendance');
      }
      // Get updated status
      const updatedStatus = await attendanceService.getLatestAttendanceStatus(
        attendanceData.employeeId,
      );

      // Handle notifications
      let notificationSent = false;
      if (user.lineUserId) {
        try {
          const notificationTime = validatedData.isCheckIn
            ? processedAttendance.regularCheckInTime
            : processedAttendance.regularCheckOutTime;

          if (validatedData.isCheckIn) {
            await notificationService.sendCheckInConfirmation(
              user.employeeId,
              user.lineUserId,
              notificationTime || now,
            );
          } else {
            await notificationService.sendCheckOutConfirmation(
              user.employeeId,
              user.lineUserId,
              notificationTime || now,
            );
          }
          notificationSent = true;
        } catch (error) {
          console.error('Notification error:', error);
          // Don't throw - notifications shouldn't fail the whole process
        }
      }

      return {
        status: updatedStatus,
        notificationSent,
        success: true,
      };
    } catch (error: any) {
      // Handle "already checked in" case specially
      if (error.message?.includes('Already checked in')) {
        const currentStatus = await attendanceService.getLatestAttendanceStatus(
          user.employeeId,
        );
        return {
          status: currentStatus,
          notificationSent: false,
          success: true,
        };
      }
      throw error; // Re-throw other errors
    }
  } catch (error: any) {
    console.error('Error in processCheckInOut:', error);
    throw error;
  }
}
// API Handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST method is allowed',
    });
  }

  try {
    console.log('Received request body:', req.body);

    // Add to queue and wait for result
    const result = await new Promise<QueueResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Processing timeout'));
      }, PROCESS_TIMEOUT);

      checkInOutQueue.push(req.body, (error, result) => {
        clearTimeout(timeoutId);
        if (error) reject(error);
        else resolve(result);
      });
    });

    return res.status(200).json({
      success: true,
      data: result.status,
      notificationSent: result.notificationSent,
      timestamp: getCurrentTime().toISOString(),
    });
  } catch (error: any) {
    console.error('Handler error:', error);

    // Specific error handling
    if (error.message === 'Processing timeout') {
      return res.status(504).json({
        error: 'Gateway Timeout',
        message:
          'Processing took too long. Please check your attendance status.',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    // Handle validation errors specifically
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.errors,
        timestamp: getCurrentTime().toISOString(),
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
      timestamp: getCurrentTime().toISOString(),
    });
  }
}

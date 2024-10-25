// pages/api/leaveRequest/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '@/services/NotificationService';
import { z } from 'zod';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);
const leaveService = createLeaveServiceServer(prisma, notificationService);

// Request validation schema
const createLeaveRequestSchema = z.object({
  lineUserId: z.string(),
  leaveType: z.string(),
  leaveFormat: z.string(),
  reason: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  fullDayCount: z.number(),
  resubmitted: z.boolean().optional(),
  originalRequestId: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    // Validate request body
    const validatedData = createLeaveRequestSchema.parse(req.body);

    const newLeaveRequest = await leaveService.createLeaveRequest(
      validatedData.lineUserId,
      validatedData.leaveType,
      validatedData.leaveFormat,
      validatedData.reason,
      validatedData.startDate,
      validatedData.endDate,
      validatedData.fullDayCount,
      validatedData.resubmitted,
      validatedData.originalRequestId,
    );

    return res.status(201).json({
      success: true,
      data: newLeaveRequest,
    });
  } catch (error) {
    console.error('Error creating leave request:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof Error) {
      // Handle specific error cases
      if (error.message.includes('User not found')) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }
      if (error.message.includes('ไม่มีวันลา')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

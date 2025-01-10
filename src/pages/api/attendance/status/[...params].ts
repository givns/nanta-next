// In api/attendance/status/[...params].ts
import { getCurrentTime } from '@/utils/dateUtils';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';

import type { NextApiRequest, NextApiResponse } from 'next';
import { AppError, ErrorCode } from '@/types/attendance';

// Initialize Prisma client
const prisma = new PrismaClient();

// Type for initialized services
type InitializedServices = Awaited<ReturnType<typeof initializeServices>>;

// Cache the services initialization promise
let servicesPromise: Promise<InitializedServices> | null = null;

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

  return services;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET method is allowed',
    });
  }

  try {
    const params = req.query.params;
    if (!params || !Array.isArray(params) || params.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid or missing path parameters',
      });
    }
    const employeeId = params[0];
    const action = params[1]; // 'next-day' or undefined for regular status

    const services = await getServices();

    if (action === 'next-day') {
      const nextDayState = await services.shiftService.getNextDayPeriodState(
        employeeId,
        getCurrentTime(),
      );

      return res.status(200).json(nextDayState);
    }

    // Original status endpoint logic
    const status = await services.attendanceService.getAttendanceStatus(
      employeeId,
      {
        inPremises: req.query.inPremises === 'true',
        address: (req.query.address as string) || '',
      },
    );

    return res.status(200).json(status);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

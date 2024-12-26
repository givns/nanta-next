import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import { AppError, ErrorCode } from '@/types/attendance/error';

// Initialize Prisma client
const prisma = new PrismaClient();

// Define the services type
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
  try {
    // Initialize services at the start of the request
    const services = await getServices();
    const { attendanceService } = services;

    if (req.method === 'GET') {
      const { employeeId } = req.query;

      if (typeof employeeId !== 'string') {
        return res.status(400).json({
          error: 'Invalid employeeId',
          message: 'Employee ID must be a string',
        });
      }

      try {
        const attendanceStatus = await attendanceService.getAttendanceStatus(
          employeeId,
          {
            inPremises: false,
            address: '',
          },
        );
        return res.status(200).json(attendanceStatus);
      } catch (error) {
        console.error('Error fetching attendance status:', error);
        if (error instanceof AppError) {
          return res.status(400).json({
            error: error.code,
            message: error.message,
          });
        }
        return res.status(500).json({
          error: ErrorCode.INTERNAL_ERROR,
          message: 'Failed to fetch attendance status',
        });
      }
    }

    if (req.method === 'POST') {
      try {
        const attendanceData = req.body;
        const result =
          await attendanceService.processAttendance(attendanceData);
        return res.status(200).json(result);
      } catch (error) {
        console.error('Error processing attendance:', error);
        if (error instanceof AppError) {
          return res.status(400).json({
            error: error.code,
            message: error.message,
          });
        }
        return res.status(500).json({
          error: ErrorCode.INTERNAL_ERROR,
          message: 'Failed to process attendance',
        });
      }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Method ${req.method} is not allowed`,
    });
  } catch (error) {
    console.error('Service initialization error:', error);
    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    });
  } finally {
    await prisma.$disconnect();
  }
}

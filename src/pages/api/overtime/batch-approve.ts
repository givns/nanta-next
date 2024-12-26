// pages/api/overtime/batchApprove.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import { AppError, ErrorCode } from '@/types/attendance';

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

// Initialize services at startup
let services: InitializedServices;
getServices()
  .then((s) => {
    services = s;
  })
  .catch((error) => {
    console.error('Failed to initialize services:', error);
    process.exit(1); // Exit if services can't be initialized
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { requestIds, approverId } = req.body;

      const approvedRequests =
        await services.overtimeService.batchApproveOvertimeRequests(
          requestIds,
          approverId,
        );

      res
        .status(200)
        .json({ message: 'Requests approved successfully', approvedRequests });
    } catch (error) {
      console.error('Error approving overtime requests:', error);
      res.status(500).json({ message: 'Error approving overtime requests' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

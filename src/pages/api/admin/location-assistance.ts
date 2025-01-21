// pages/api/admin/location-assistance.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import {
  validateLocationAssistanceCreate,
  validateLocationAssistanceUpdate,
} from '@/schemas/location-assistance';

const prisma = new PrismaClient();

// Initialize services promise
let servicesPromise: Promise<{
  locationAssistanceService: any;
  notificationService: any;
}> | null = null;

const getServices = async () => {
  if (!servicesPromise) {
    servicesPromise = initializeServices(prisma);
  }
  return servicesPromise;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const services = await getServices();

    switch (req.method) {
      case 'POST':
        return handleCreateRequest(
          req,
          res,
          services.locationAssistanceService,
        );

      case 'GET':
        if (req.query.requestId) {
          return handleGetRequest(req, res, services.locationAssistanceService);
        }
        return handleGetPendingRequests(
          req,
          res,
          services.locationAssistanceService,
        );

      case 'PUT':
        return handleUpdateRequest(
          req,
          res,
          services.locationAssistanceService,
        );

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Location assistance API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleCreateRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  locationService: any,
) {
  try {
    const validatedData = validateLocationAssistanceCreate(req.body);
    const request = await locationService.createRequest(validatedData);
    return res.status(200).json(request);
  } catch (error) {
    console.error('Create request error:', error);
    return res.status(400).json({
      error: 'Invalid request data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleGetRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  locationService: any,
) {
  const { requestId } = req.query;
  if (typeof requestId !== 'string') {
    return res.status(400).json({ error: 'Invalid request ID' });
  }

  try {
    const request = await locationService.getRequestById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    return res.status(200).json(request);
  } catch (error) {
    console.error('Get request error:', error);
    return res.status(500).json({ error: 'Failed to fetch request' });
  }
}

async function handleGetPendingRequests(
  req: NextApiRequest,
  res: NextApiResponse,
  locationService: any,
) {
  try {
    const requests = await locationService.getPendingRequests();
    return res.status(200).json(requests);
  } catch (error) {
    console.error('Get pending requests error:', error);
    return res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
}

async function handleUpdateRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  locationService: any,
) {
  try {
    const validatedData = validateLocationAssistanceUpdate(req.body);
    const { requestId, ...updateData } = validatedData;

    let request;
    if (updateData.status === 'APPROVED') {
      request = await locationService.approveRequest(requestId, {
        verificationNote: updateData.verificationNote || '',
        verifiedBy: updateData.verifiedBy,
      });
    } else {
      request = await locationService.rejectRequest(requestId, {
        rejectionReason: updateData.rejectionReason || '',
        verifiedBy: updateData.verifiedBy,
      });
    }

    return res.status(200).json(request);
  } catch (error) {
    console.error('Update request error:', error);
    return res.status(400).json({
      error: 'Invalid update data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

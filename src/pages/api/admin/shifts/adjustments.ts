// pages/api/admin/attendance/overtime-requests.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';

const prisma = new PrismaClient();
const services = initializeServices(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { method } = req;
  const lineUserId = req.headers['x-line-userid'] as string;

  if (!lineUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let result;
    switch (method) {
      case 'GET': {
        result = await prisma.overtimeRequest.findMany({
          where: {
            status: (req.query.status as string) || undefined,
          },
          include: {
            user: {
              select: {
                name: true,
                departmentName: true,
                employeeId: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        const transformedRequests = result.map((request) => ({
          id: request.id,
          employeeId: request.employeeId,
          name: request.user.name,
          department: request.user.departmentName,
          date: request.date,
          startTime: request.startTime,
          endTime: request.endTime,
          duration: calculateDuration(request.startTime, request.endTime),
          reason: request.reason || '',
          status: request.status,
          isDayOffOvertime: request.isDayOffOvertime,
          approverId: request.approverId,
        }));

        return res.status(200).json(transformedRequests);
      }

      case 'POST': {
        const { requestIds, action } = req.body;

        if (action === 'approve') {
          result = await services.overtimeService.batchApproveOvertimeRequests(
            requestIds,
            user.employeeId,
          );
          return res.status(200).json({
            message: 'Requests approved successfully',
            results: result,
          });
        }

        if (action === 'reject') {
          result = await Promise.all(
            requestIds.map(async (id: string) => {
              const request = await prisma.overtimeRequest.update({
                where: { id },
                data: {
                  status: 'rejected',
                  approverId: user.employeeId,
                },
                include: {
                  user: true,
                },
              });

              if (request.user.lineUserId) {
                await services.notificationService.sendOvertimeResponseNotification(
                  request.employeeId,
                  request.user.lineUserId,
                  request,
                );
              }

              return request;
            }),
          );

          return res.status(200).json({
            message: 'Requests rejected successfully',
            results: result,
          });
        }

        return res.status(400).json({ message: 'Invalid action' });
      }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res
          .status(405)
          .json({ message: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Error processing overtime request:', error);
    return res.status(500).json({ message: 'Internal server error', error });
  }
}

function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  let hours = endHour - startHour;
  let minutes = endMinute - startMinute;

  if (minutes < 0) {
    hours -= 1;
    minutes += 60;
  }

  return Number((hours + minutes / 60).toFixed(1));
}

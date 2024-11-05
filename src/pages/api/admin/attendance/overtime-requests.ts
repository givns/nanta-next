// pages/api/admin/attendance/overtime-requests.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '@/services/NotificationService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { HolidayService } from '@/services/HolidayService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { TimeEntryService } from '@/services/TimeEntryService';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);
const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const holidayService = new HolidayService(prisma);
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

type OvertimeStatus =
  | 'pending_response'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'declined_by_employee';

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
        const requestedStatus = req.query.status as OvertimeStatus;
        let whereClause: any = {
          employeeResponse: 'approve', // Always require employee approval
        };

        if (requestedStatus === 'pending') {
          whereClause = {
            AND: [{ employeeResponse: 'approve' }, { status: 'pending' }],
          };
        } else if (requestedStatus === 'approved') {
          whereClause = {
            AND: [{ employeeResponse: 'approve' }, { status: 'approved' }],
          };
        } else {
          // Default to show both pending and approved
          whereClause = {
            AND: [
              { employeeResponse: 'approve' },
              {
                status: {
                  in: ['pending', 'approved'],
                },
              },
            ],
          };
        }

        console.log('Query filter:', JSON.stringify(whereClause, null, 2));

        result = await prisma.overtimeRequest.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                name: true,
                departmentName: true,
                employeeId: true,
              },
            },
          },
          orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
        });

        console.log(`Found ${result.length} requests matching filter`);

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
          result = await overtimeService.batchApproveOvertimeRequests(
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
                await notificationService.sendOvertimeResponseNotification(
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

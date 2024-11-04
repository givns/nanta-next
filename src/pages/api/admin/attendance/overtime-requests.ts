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

    switch (method) {
      case 'GET':
        const requests = await prisma.overtimeRequest.findMany({
          where: {
            // Filter based on query parameters if needed
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

        // Transform the data to match the frontend interface
        const transformedRequests = requests.map((request) => ({
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

      case 'POST':
        const { requestIds, action } = req.body;

        if (action === 'approve') {
          const results = await overtimeService.batchApproveOvertimeRequests(
            requestIds,
            user.employeeId,
          );
          return res
            .status(200)
            .json({ message: 'Requests approved successfully', results });
        }

        if (action === 'reject') {
          // Handle rejection logic here
          const results = await Promise.all(
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

              // Send notification to employee
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

          return res
            .status(200)
            .json({ message: 'Requests rejected successfully', results });
        }

        return res.status(400).json({ message: 'Invalid action' });

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

// pages/api/admin/approvals/index.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '@/services/NotificationService';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);

interface ApprovalRequest {
  id: string;
  type: 'leave' | 'overtime';
  employeeId: string;
  employeeName: string;
  department: string;
  requestDate: Date;
  details: {
    startDate?: Date;
    endDate?: Date;
    startTime?: string;
    endTime?: string;
    reason: string;
    leaveType?: string;
    duration?: number;
  };
  status: 'pending' | 'approved' | 'rejected';
  isUrgent: boolean;
}

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
      case 'GET': {
        // Get pending leave requests
        const leaveRequests = await prisma.leaveRequest.findMany({
          where: {
            status: 'pending',
          },
          include: {
            user: {
              select: {
                name: true,
                departmentName: true,
              },
            },
          },
        });

        // Get overtime requests that are pending admin approval
        const overtimeRequests = await prisma.overtimeRequest.findMany({
          where: {
            status: 'pending',
            employeeResponse: 'approve',
          },
          include: {
            user: {
              select: {
                name: true,
                departmentName: true,
              },
            },
          },
        });

        // Transform the requests into a unified format
        const formattedRequests: ApprovalRequest[] = [
          ...leaveRequests.map((leave) => ({
            id: leave.id,
            type: 'leave' as const,
            employeeId: leave.employeeId,
            employeeName: leave.user.name,
            department: leave.user.departmentName,
            requestDate: leave.createdAt,
            details: {
              startDate: leave.startDate,
              endDate: leave.endDate,
              reason: leave.reason,
              leaveType: leave.leaveType,
            },
            status: 'pending' as const, // Update the type of status property
            isUrgent: leave.resubmitted || false,
          })),
          ...overtimeRequests.map((ot) => ({
            id: ot.id,
            type: 'overtime' as const,
            employeeId: ot.employeeId,
            employeeName: ot.user.name,
            department: ot.user.departmentName,
            requestDate: ot.createdAt,
            details: {
              startTime: ot.startTime,
              endTime: ot.endTime,
              reason: ot.reason || '',
              duration: calculateOvertimeDuration(ot.startTime, ot.endTime),
            },
            status: 'pending' as const, // Update the type of status property
            isUrgent: ot.isDayOffOvertime,
          })),
        ];

        return res.status(200).json(formattedRequests);
      }
    }
  } catch (error) {
    console.error('Error processing approval request:', error);
    return res.status(500).json({ message: 'Internal server error', error });
  }
}

function calculateOvertimeDuration(startTime: string, endTime: string): number {
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

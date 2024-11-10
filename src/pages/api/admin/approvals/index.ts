// pages/api/admin/approvals/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '@/services/NotificationService';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);

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
        // Get leave requests with status 'pending'
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

        // Get overtime requests where employee has approved (status: pending)
        const overtimeRequests = await prisma.overtimeRequest.findMany({
          where: {
            status: 'pending',
            employeeResponse: 'approve', // Only get requests approved by employees
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
        const formattedRequests = [
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
            status: leave.status,
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
              durationMinutes: ot.durationMinutes,
            },
            status: ot.status,
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

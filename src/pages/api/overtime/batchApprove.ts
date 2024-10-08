// pages/api/overtime/batchApprove.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '../../../services/NotificationService';

const prisma = new PrismaClient();
export const notificationService = createNotificationService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { requestIds, approverId } = req.body;
      const approver = await prisma.user.findUnique({
        where: { id: approverId },
      });

      if (!approver) {
        return res.status(400).json({ message: 'Approver not found' });
      }

      const approvedRequests = await prisma.$transaction(async (prisma) => {
        const approved = [];
        for (const id of requestIds) {
          const request = await prisma.overtimeRequest.update({
            where: { id },
            data: { status: 'approved', approverId },
          });

          // Create TimeEntry
          await prisma.timeEntry.create({
            data: {
              employeeId: request.employeeId,
              date: request.date,
              startTime: new Date(
                `${request.date.toISOString().split('T')[0]}T${request.startTime}`,
              ),
              endTime: new Date(
                `${request.date.toISOString().split('T')[0]}T${request.endTime}`,
              ),
              regularHours: 0,
              overtimeHours: calculateOvertimeHours(
                request.startTime,
                request.endTime,
              ),
              status: 'approved',
              overtimeRequestId: request.id,
            },
          });

          approved.push(request);
        }
        return approved;
      });

      // Send notifications after the transaction is complete
      for (const request of approvedRequests) {
        await notificationService.sendOvertimeApprovalNotification(
          request,
          approver.employeeId,
        );
      }

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

function calculateOvertimeHours(startTime: string, endTime: string): number {
  const start = new Date(`1970-01-01T${startTime}`);
  const end = new Date(`1970-01-01T${endTime}`);
  const diff = end.getTime() - start.getTime();
  return diff / (1000 * 60 * 60); // Convert milliseconds to hours
}

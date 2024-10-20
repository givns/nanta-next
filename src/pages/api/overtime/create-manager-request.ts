import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../../../services/NotificationService';
import { UserRole } from '../../../types/enum';

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId, employeeIds, date, startTime, endTime, reasons } =
    req.body;

  try {
    const manager = await prisma.user.findUnique({ where: { lineUserId } });
    if (!manager) {
      return res.status(404).json({ message: 'User not found' });
    }

    const formattedReason = reasons
      .map((r: any) => `${r.reason}: ${r.details}`)
      .join('; ');

    const createdRequests = await Promise.all(
      employeeIds.map(async (employeeId: string) => {
        try {
          const employee = await prisma.user.findUnique({
            where: { id: employeeId },
          });
          if (!employee) {
            console.warn(`Employee with id ${employeeId} not found`);
            return null;
          }

          const request = await prisma.overtimeRequest.create({
            data: {
              employeeId: employee.employeeId,
              name: employee.name,
              date: new Date(date),
              startTime,
              endTime,
              reason: formattedReason,
              status: 'pending_response',
              approverId: manager.id,
            },
          });

          if (employee.lineUserId) {
            await notificationService.sendOvertimeRequestNotification(
              request,
              employee.employeeId,
              employee.lineUserId,
            );
          } else {
            console.warn(
              `Employee ${employee.employeeId} does not have a LINE User ID`,
            );
          }

          return request;
        } catch (error) {
          console.error(
            `Error creating overtime request for employee ${employeeId}:`,
            error,
          );
          return null;
        }
      }),
    );

    const successfulRequests = createdRequests.filter(
      (request) => request !== null,
    );

    res.status(201).json({
      message: 'Overtime requests created successfully',
      data: successfulRequests,
      failedCount: createdRequests.length - successfulRequests.length,
    });
  } catch (error: any) {
    console.error('Error creating overtime requests:', error);
    res.status(500).json({
      message: 'Error creating overtime requests',
      error: error.message,
    });
  }
}

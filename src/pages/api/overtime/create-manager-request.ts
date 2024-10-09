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

  const { lineUserId, employeeIds, date, startTime, endTime, reason } =
    req.body;

  try {
    const manager = await prisma.user.findUnique({ where: { lineUserId } });
    if (
      !manager ||
      ![UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN].includes(
        manager.role as UserRole,
      )
    ) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const createdRequests = await Promise.all(
      employeeIds.map(async (employeeId: string) => {
        const employee = await prisma.user.findUnique({
          where: { id: employeeId },
        });
        if (!employee) {
          throw new Error(`Employee with id ${employeeId} not found`);
        }

        const request = await prisma.overtimeRequest.create({
          data: {
            employeeId: employee.employeeId,
            date: new Date(date),
            startTime,
            endTime,
            reason,
            status: 'pending',
          },
        });

        if (employee.lineUserId) {
          await notificationService.sendNotification(
            employee.employeeId,
            employee.lineUserId,
            JSON.stringify({
              type: 'text',
              text: `New overtime request for ${new Date(date).toLocaleDateString()} from ${startTime} to ${endTime}`,
            }),
            'overtime',
          );
        } else {
          console.warn(
            `Employee ${employee.employeeId} does not have a LINE User ID`,
          );
        }

        return request;
      }),
    );

    res.status(201).json({
      message: 'Overtime requests created successfully',
      data: createdRequests,
    });
  } catch (error: any) {
    console.error('Error creating overtime requests:', error);
    res.status(500).json({
      message: 'Error creating overtime requests',
      error: error.message,
    });
  }
}

// pages/api/admin/shifts/adjustments.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '@/services/NotificationService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);
const holidayService = new HolidayService(prisma);
const shiftManagementService = new ShiftManagementService(
  prisma,
  holidayService,
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
        const adjustments = await prisma.shiftAdjustmentRequest.findMany({
          where: {
            status: (req.query.status as string) || undefined,
          },
          include: {
            user: {
              select: {
                name: true,
                departmentName: true,
                employeeId: true,
                lineUserId: true,
              },
            },
            requestedShift: true,
          },
          orderBy: {
            date: 'desc',
          },
        });

        return res.status(200).json(adjustments);

      case 'POST':
        const { action, adjustments: adjustmentData } = req.body;

        if (action === 'create') {
          const { targetType, adjustments, date, reason } = adjustmentData;

          const results = await prisma.$transaction(async (prisma) => {
            const created = [];

            if (targetType === 'department') {
              for (const adjustment of adjustments) {
                const { department, shiftId } = adjustment;
                const users = await prisma.user.findMany({
                  where: { departmentId: department },
                });

                for (const user of users) {
                  const shiftAdjustment =
                    await prisma.shiftAdjustmentRequest.create({
                      data: {
                        employeeId: user.employeeId,
                        requestedShiftId: shiftId,
                        date: new Date(date),
                        reason,
                        status: 'approved',
                      },
                      include: {
                        requestedShift: true,
                        user: true,
                      },
                    });
                  created.push(shiftAdjustment);

                  // Send notification to user
                  if (user.lineUserId) {
                    const shift = shiftAdjustment.requestedShift;
                    const message = `แจ้งเตือน: การเปลี่ยนแปลงเวลาทำงาน
                      วันที่: ${format(new Date(date), 'dd MMMM yyyy', { locale: th })}
                      เวลาทำงาน: ${shift.name}
                      เวลา: ${shift.startTime} - ${shift.endTime}
                      เหตุผล: ${reason}`;

                    await notificationService.sendNotification(
                      user.employeeId,
                      user.lineUserId,
                      message,
                      'shift',
                    );
                  }
                }
              }
            } else {
              // Individual adjustment
              for (const adjustment of adjustments) {
                const { employeeId, shiftId } = adjustment;
                const targetUser = await prisma.user.findUnique({
                  where: { employeeId },
                });

                if (targetUser) {
                  const shiftAdjustment =
                    await prisma.shiftAdjustmentRequest.create({
                      data: {
                        employeeId,
                        requestedShiftId: shiftId,
                        date: new Date(date),
                        reason,
                        status: 'approved',
                      },
                      include: {
                        requestedShift: true,
                        user: true,
                      },
                    });
                  created.push(shiftAdjustment);

                  // Send notification
                  if (targetUser.lineUserId) {
                    const shift = shiftAdjustment.requestedShift;
                    const message = `แจ้งเตือน: การเปลี่ยนแปลงเวลาทำงาน
                      วันที่: ${format(new Date(date), 'dd MMMM yyyy', { locale: th })}
                      เวลาทำงาน: ${shift.name}
                      เวลา: ${shift.startTime} - ${shift.endTime}
                      เหตุผล: ${reason}`;

                    await notificationService.sendNotification(
                      employeeId,
                      targetUser.lineUserId,
                      message,
                      'shift',
                    );
                  }
                }
              }
            }

            // Notify admins
            const admins = await prisma.user.findMany({
              where: {
                role: {
                  in: ['Admin', 'SuperAdmin'],
                },
                NOT: {
                  id: user.id,
                },
              },
            });

            for (const admin of admins) {
              if (admin.lineUserId) {
                const message = `แจ้งเตือน: มีการเปลี่ยนแปลงเวลาทำงาน
                  ผู้ดำเนินการ: ${user.name}
                  วันที่: ${format(new Date(date), 'dd MMMM yyyy', { locale: th })}
                  จำนวนผู้ได้รับการปรับเวลาการทำงาน: ${created.length} คน
                  เหตุผล: ${reason}`;

                await notificationService.sendNotification(
                  admin.employeeId,
                  admin.lineUserId,
                  message,
                  'shift',
                );
              }
            }

            return created;
          });

          return res.status(200).json(results);
        }

        return res.status(400).json({ message: 'Invalid action' });

      case 'DELETE':
        const { id } = req.query;

        const deleted = await prisma.shiftAdjustmentRequest.delete({
          where: { id: id as string },
        });

        return res.status(200).json(deleted);

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res
          .status(405)
          .json({ message: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Error processing shift adjustment:', error);
    return res.status(500).json({ message: 'Internal server error', error });
  }
}

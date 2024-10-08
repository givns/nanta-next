// pages/api/adjust-shift.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import moment from 'moment-timezone';
import { createNotificationService } from '@/services/NotificationService';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { lineUserId, targetType, adjustments, date, reason } = req.body;

    console.log('Received data:', {
      lineUserId,
      targetType,
      adjustments,
      date,
      reason,
    });

    // Validate input
    if (!lineUserId || !targetType || !adjustments || !date || !reason) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // Parse the date string to a Date object without any timezone conversion
    const adjustmentDate = new Date(date);

    // Find the user making the request
    const requestingUser = await prisma.user.findUnique({
      where: { lineUserId: lineUserId },
    });

    if (!requestingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the user has permission to make adjustments
    if (
      requestingUser.role.toUpperCase() !== 'ADMIN' &&
      requestingUser.role.toUpperCase() !== 'SUPERADMIN'
    ) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const shiftAdjustments: ({
      requestedShift: {
        id: string;
        shiftCode: string;
        name: string;
        startTime: string;
        endTime: string;
        workDays: number[];
      };
    } & {
      employeeId: string;
      requestedShiftId: string;
      date: Date;
      reason: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    })[] = [];
    const affectedUsers = new Map();

    await prisma.$transaction(async (prisma) => {
      if (targetType === 'department') {
        for (const adjustment of adjustments) {
          const { department, shiftId } = adjustment;

          const users = await prisma.user.findMany({
            where: { departmentId: department },
          });

          console.log(
            `Found ${users.length} users for department ${department}`,
          );

          for (const user of users) {
            const shiftAdjustment = await prisma.shiftAdjustmentRequest.create({
              data: {
                employeeId: user.employeeId,
                requestedShiftId: shiftId,
                date: adjustmentDate,
                reason: reason,
                status: 'approved',
              },
              include: {
                requestedShift: true,
              },
            });
            shiftAdjustments.push(shiftAdjustment);
            affectedUsers.set(
              user.id.toString(),
              shiftAdjustment.requestedShift,
            );
          }
        }
      } else if (targetType === 'individual') {
        for (const adjustment of adjustments) {
          const { employeeId, shiftId } = adjustment;

          const user = await prisma.user.findUnique({
            where: { employeeId: employeeId },
          });

          if (!user) {
            throw new Error(`User with employee ID ${employeeId} not found`);
          }

          const shiftAdjustment = await prisma.shiftAdjustmentRequest.create({
            data: {
              employeeId: user.employeeId,
              requestedShiftId: shiftId,
              date: adjustmentDate,
              reason: reason,
              status: 'approved',
            },
            include: {
              requestedShift: true,
            },
          });
          shiftAdjustments.push(shiftAdjustment);
          affectedUsers.set(
            user.employeeId.toString(),
            shiftAdjustment.requestedShift,
          );
        }
      } else {
        throw new Error('Invalid target type');
      }
    });

    // Create a set of all users who need to be notified
    const usersToNotify = new Set(affectedUsers.keys());

    // Fetch LINE user IDs for affected users and SuperAdmins
    const superAdmins = await prisma.user.findMany({
      where: {
        role: 'SuperAdmin',
        NOT: {
          id: requestingUser.employeeId,
        },
      },
      select: { id: true, lineUserId: true, name: true },
    });

    for (const admin of superAdmins) {
      usersToNotify.add(admin.id);
    }

    const usersWithLineIds = await prisma.user.findMany({
      where: { id: { in: Array.from(usersToNotify) } },
      select: { id: true, lineUserId: true, role: true },
    });

    const lineUserIdMap = new Map(
      usersWithLineIds.map((u) => [
        u.id,
        { lineUserId: u.lineUserId, role: u.role },
      ]),
    );

    // For notifications, use the Bangkok time
    const formattedDate = moment(adjustmentDate).format('LL');

    // Notify users
    for (const employeeId of usersToNotify) {
      const userInfo = lineUserIdMap.get(employeeId);
      if (userInfo && userInfo.lineUserId) {
        let message;
        if (affectedUsers.has(employeeId)) {
          const shift = affectedUsers.get(employeeId);
          message = `แจ้งเตือน: การเปลี่ยนแปลงเวลาทำงาน

                     วันที่: ${formattedDate}
                     เวลาทำงาน: ${shift.name}
                     เวลา: ${shift.startTime} - ${shift.endTime}
                     เหตุผล: ${reason}`;
        }
        if (
          userInfo.role === 'SuperAdmin' &&
          employeeId !== requestingUser.id
        ) {
          message = `แจ้งเตือน: มีการเปลี่ยนแปลงเวลาทำงาน
                    ผู้ดำเนินการ: ${requestingUser.name}
                    วันที่: ${formattedDate}
                    จำนวนผู้ได้รับการปรับเวลาการทำงาน: ${affectedUsers.size} คน
                    เหตุผล: ${reason}`;
        }
        if (message) {
          try {
            await notificationService.sendNotification(
              lineUserId,
              employeeId,
              message,
              'shift',
            );
            console.log(`Notification sent successfully to user ${employeeId}`);
          } catch (error) {
            console.error(
              `Failed to send notification to user ${employeeId}:`,
              error,
            );
          }
        }
      }
    }

    for (const admin of superAdmins) {
      if (admin.lineUserId) {
        await notificationService.sendNotification(
          admin.id,
          admin.lineUserId,
          `แจ้งเตือน: มีการเปลี่ยนแปลงเวลาทำงาน

          ผู้ดำเนินการ: ${requestingUser.name}
          วันที่: ${formattedDate}
          จำนวนผู้ได้รับการปรับเวลาการทำงาน: ${affectedUsers.size} คน

          เหตุผล: ${reason}`,
          'shift',
        );
      }
    }

    res.status(200).json({
      message: 'Shift adjustments created and notifications sent successfully',
      adjustments: shiftAdjustments,
    });
  } catch (error: any) {
    console.error('Error processing shift adjustments:', error);
    res.status(500).json({
      message: 'Error processing shift adjustments',
      error: error.message,
    });
  }
}

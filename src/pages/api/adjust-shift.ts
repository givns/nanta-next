// pages/api/adjust-shift.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { NotificationService } from '../../services/NotificationService';
import moment from 'moment-timezone';

const notificationService = new NotificationService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { lineUserId, targetType, adjustments, date, reason } = req.body;

    // Validate input
    if (!lineUserId || !targetType || !adjustments || !date || !reason) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Create a moment object in Bangkok time, set to the start of the day
    const adjustmentDate = moment.tz(date, 'Asia/Bangkok').startOf('day');

    // Convert to UTC for storage, but keep it as the same calendar date
    const utcAdjustmentDate = adjustmentDate.utc().toDate();

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
      id: string;
      userId: string;
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

          for (const user of users) {
            const shiftAdjustment = await prisma.shiftAdjustmentRequest.create({
              data: {
                userId: user.id,
                requestedShiftId: shiftId,
                date: utcAdjustmentDate, // Use the UTC date here
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
              userId: user.id,
              requestedShiftId: shiftId,
              date: utcAdjustmentDate, // Use the UTC date here
              reason: reason,
              status: 'approved',
            },
            include: {
              requestedShift: true,
            },
          });
          shiftAdjustments.push(shiftAdjustment);
          affectedUsers.set(user.id.toString(), shiftAdjustment.requestedShift);
        }
      } else {
        throw new Error('Invalid target type');
      }
    });

    // Fetch LINE user IDs for affected users
    const userIds = Array.from(affectedUsers.keys());
    const usersWithLineIds = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, lineUserId: true },
    });

    const lineUserIdMap = new Map(
      usersWithLineIds.map((u) => [u.id, u.lineUserId]),
    );

    // For notifications, use the Bangkok time
    const formattedDate = adjustmentDate.format('LL');

    // Notify affected users
    for (const [userId, shift] of affectedUsers) {
      const userLineId = lineUserIdMap.get(userId);
      if (userLineId) {
        await notificationService.sendNotification(
          userId,
          `แจ้งเตือน: การเปลี่ยนแปลงเวลาทำงาน

วันที่: ${formattedDate}
กะใหม่: ${shift.name}
เวลา: ${shift.startTime} - ${shift.endTime}

เหตุผล: ${reason}`,
          userLineId,
        );
      }
    }

    // Notify SuperAdmins (excluding the requester)
    const superAdmins = await prisma.user.findMany({
      where: {
        role: 'SuperAdmin',
        NOT: {
          id: requestingUser.id,
        },
      },
      select: { id: true, lineUserId: true, name: true },
    });

    for (const admin of superAdmins) {
      if (admin.lineUserId) {
        await notificationService.sendNotification(
          admin.id,
          `แจ้งเตือน: มีการเปลี่ยนแปลงเวลาทำงาน

          ผู้ดำเนินการ: ${requestingUser.name}
          วันที่: ${formattedDate}
          จำนวนผู้ได้รับการปรับเวลาการทำงาน: ${affectedUsers.size} คน

          เหตุผล: ${reason}`,
          admin.lineUserId,
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

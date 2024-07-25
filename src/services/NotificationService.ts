// NotificationService.ts

import { PrismaClient, User, OvertimeRequest } from '@prisma/client';
import { LineService } from '@/services/LineService';

const prisma = new PrismaClient();
const lineService = new LineService();

export class NotificationService {
  private lineService: LineService;

  constructor() {
    this.lineService = new LineService();
  }
  async sendNotification(
    userId: string,
    message: string,
    lineUserId?: string,
  ): Promise<void> {
    if (lineUserId) {
      await lineService.sendNotification(lineUserId, message);
    } else {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user && user.lineUserId) {
        await lineService.sendNotification(user.lineUserId, message);
      } else {
        console.warn(`No LINE user ID found for user ${userId}`);
      }
    }
  }

  async notifyAdminsOfMissingCheckIn(
    userId: string,
    employeeId: string,
    potentialStartTime: string,
    checkOutTime: string,
    pendingAttendanceId: string,
  ): Promise<void> {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, lineUserId: true },
    });

    const flexContent = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'Missing Check-in Approval Required',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: `Employee ID: ${employeeId}`,
          },
          {
            type: 'text',
            text: `Potential Start Time: ${potentialStartTime}`,
          },
          {
            type: 'text',
            text: `Check-out Time: ${checkOutTime}`,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'postback',
              label: 'Approve',
              data: `action=approve&attendanceId=${pendingAttendanceId}`,
            },
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: 'Deny',
              data: `action=deny&attendanceId=${pendingAttendanceId}`,
            },
          },
        ],
      },
    };

    for (const admin of admins) {
      if (admin.lineUserId) {
        await this.sendFlexMessage(
          admin.lineUserId,
          'Missing Check-in Approval',
          flexContent,
        );
      }
    }
  }

  async sendFlexMessage(
    lineUserId: string,
    altText: string,
    flexContent: any,
  ): Promise<void> {
    await lineService.sendFlexMessage(lineUserId, altText, flexContent);
  }

  async sendOvertimeApprovalNotification(
    overtimeRequest: OvertimeRequest & { user: User },
    approver: User,
  ): Promise<void> {
    if (!overtimeRequest.user.lineUserId) {
      console.warn(
        'No LINE user ID provided for overtime approval notification',
      );
      return;
    }

    const message = `Your overtime request for ${overtimeRequest.date.toDateString()} (${overtimeRequest.startTime} - ${overtimeRequest.endTime}) has been approved by ${approver.name}.`;

    await this.sendNotification(
      overtimeRequest.userId,
      message,
      overtimeRequest.user.lineUserId,
    );
  }

  async sendOvertimeAutoApprovalNotification(
    overtimeRequest: OvertimeRequest & { user: User },
  ): Promise<void> {
    if (!overtimeRequest.user.lineUserId) {
      console.warn(
        'No LINE user ID provided for overtime auto-approval notification',
      );
      return;
    }

    const message = `Your overtime request for ${overtimeRequest.date.toDateString()} (${overtimeRequest.startTime} - ${overtimeRequest.endTime}) has been automatically approved as it's less than or equal to 2 hours.`;

    await this.sendNotification(
      overtimeRequest.userId,
      message,
      overtimeRequest.user.lineUserId,
    );
  }
}

export const notificationService = new NotificationService();

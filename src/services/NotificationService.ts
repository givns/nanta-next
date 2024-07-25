import axios from 'axios';
import { OvertimeRequest, User, PrismaClient } from '@prisma/client';
import { LineService } from '@/services/LineService';

const prisma = new PrismaClient();
const lineService = new LineService();

export class NotificationService {
  sendFlexMessage: any;
  static notifyAdminsOfMissingCheckIn(
    userId: any,
    employeeId: any,
    arg2: string,
    arg3: string,
    id: string,
  ) {
    throw new Error('Method not implemented.');
  }
  async sendNotification(
    userId: string,
    message: string,
    lineUserId?: string,
  ): Promise<void> {
    if (!lineUserId) {
      console.warn('No LINE user ID provided for notification');
      return;
    }

    try {
      await lineService.sendNotification(lineUserId, message);
    } catch (error) {
      console.error('Error sending LINE notification:', error);
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
      select: { lineUserId: true },
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
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'Approve',
              uri: `https://your-admin-panel.com/approve-attendance/${pendingAttendanceId}`,
            },
          },
        ],
      },
    };

    for (const admin of admins) {
      if (admin.lineUserId) {
        await lineService.sendFlexMessage(admin.lineUserId, flexContent);
      }
    }
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

// NotificationService.ts

import axios from 'axios';
import { PrismaClient, User, OvertimeRequest } from '@prisma/client';

const prisma = new PrismaClient();

export class NotificationService {
  private lineApiUrl = 'https://api.line.me/v2/bot/message/push';
  private channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  async sendNotification(
    userId: string,
    message: string,
    lineUserId?: string,
  ): Promise<void> {
    try {
      if (lineUserId) {
        await this.sendLineMessage(lineUserId, message);
      } else {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user && user.lineUserId) {
          await this.sendLineMessage(user.lineUserId, message);
        } else {
          console.warn(`No LINE user ID found for user ${userId}`);
        }
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      throw new Error('Failed to send notification');
    }
  }

  private async sendLineMessage(
    lineUserId: string,
    message: string,
  ): Promise<void> {
    try {
      await axios.post(
        this.lineApiUrl,
        {
          to: lineUserId,
          messages: [
            {
              type: 'text',
              text: message,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.channelAccessToken}`,
          },
        },
      );
      console.log(`Notification sent to LINE user ${lineUserId}: ${message}`);
    } catch (error) {
      console.error('Error sending LINE message:', error);
      throw new Error('Failed to send LINE message');
    }
  }

  async sendConfirmationRequest(
    userId: string,
    action: 'check-in' | 'check-out',
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.lineUserId) {
      console.warn(`No LINE user ID found for user ${userId}`);
      return;
    }

    const message = {
      type: 'template',
      altText: `Confirm ${action}`,
      template: {
        type: 'confirm',
        text: `Do you want to ${action}?`,
        actions: [
          {
            type: 'postback',
            label: 'Yes',
            data: `action=${action}&confirm=yes`,
          },
          {
            type: 'postback',
            label: 'No',
            data: `action=${action}&confirm=no`,
          },
        ],
      },
    };

    try {
      await axios.post(
        this.lineApiUrl,
        {
          to: user.lineUserId,
          messages: [message],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.channelAccessToken}`,
          },
        },
      );
      console.log(`Confirmation request sent to user ${userId} for ${action}`);
    } catch (error) {
      console.error('Error sending LINE confirmation request:', error);
      throw new Error('Failed to send LINE confirmation request');
    }
  }

  async sendFlexMessage(
    lineUserId: string,
    altText: string,
    flexContent: any,
  ): Promise<void> {
    try {
      await axios.post(
        this.lineApiUrl,
        {
          to: lineUserId,
          messages: [
            {
              type: 'flex',
              altText: altText,
              contents: flexContent,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.channelAccessToken}`,
          },
        },
      );
      console.log(`Flex message sent to user ${lineUserId}`);
    } catch (error) {
      console.error('Error sending LINE flex message:', error);
      throw new Error('Failed to send LINE flex message');
    }
  }

  async sendQuickReply(
    userId: string,
    message: string,
    options: string[],
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.lineUserId) {
      console.warn(`No LINE user ID found for user ${userId}`);
      return;
    }

    const quickReply = {
      items: options.map((option) => ({
        type: 'action',
        action: {
          type: 'message',
          label: option,
          text: option,
        },
      })),
    };

    try {
      await axios.post(
        this.lineApiUrl,
        {
          to: user.lineUserId,
          messages: [
            {
              type: 'text',
              text: message,
              quickReply,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.channelAccessToken}`,
          },
        },
      );
      console.log(`Quick reply sent to user ${userId}`);
    } catch (error) {
      console.error('Error sending LINE quick reply:', error);
      throw new Error('Failed to send LINE quick reply');
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
      where: { role: 'Admin' },
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

    const altText = 'Missing Check-in Approval Required';

    for (const admin of admins) {
      if (admin.lineUserId) {
        await this.sendFlexMessage(admin.lineUserId, altText, flexContent);
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
      overtimeRequest.employeeId,
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
      overtimeRequest.employeeId,
      message,
      overtimeRequest.user.lineUserId,
    );
  }
}

export const notificationService = new NotificationService();

// services/NotificationService.ts

import { Client } from '@line/bot-sdk';
import { OvertimeRequest, User } from '@prisma/client';

export class NotificationService {
  private client: Client;

  constructor() {
    this.client = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    });
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
      await this.client.pushMessage(lineUserId, {
        type: 'text',
        text: message,
      });
    } catch (error) {
      console.error('Error sending LINE notification:', error);
      // Don't throw the error, just log it
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

// services/OvertimeNotificationService.ts

import { Client, FlexMessage } from '@line/bot-sdk';
import { OvertimeRequest, User } from '@prisma/client';
import prisma from '../lib/prisma';

export class OvertimeNotificationService {
  private client: Client;

  constructor() {
    this.client = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    });
  }

  async sendOvertimeDigest(
    managerId: string,
    pendingRequests: OvertimeRequest[],
  ): Promise<void> {
    const message = this.createDigestMessage(pendingRequests);
    await this.client.pushMessage(managerId, message);
  }

  async sendBatchApprovalNotification(
    admin: User,
    approvedRequests: OvertimeRequest[],
  ): Promise<void> {
    const message = this.createBatchApprovalMessage(approvedRequests);
    if (admin.lineUserId) {
      await this.client.pushMessage(admin.lineUserId, message);
    }
  }

  async sendOvertimeRequestNotification(
    request: OvertimeRequest,
  ): Promise<void> {
    const admins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'ADMIN' }, { role: 'SUPERADMIN' }],
      },
    });

    for (const admin of admins) {
      const message = this.createOvertimeRequestMessage(request);
      if (admin.lineUserId) {
        await this.client.pushMessage(admin.lineUserId, message);
      }
    }
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

  async sendOvertimeApprovalNotification(
    overtimeRequest: OvertimeRequest & { user: User },
    approverId: User,
  ): Promise<void> {
    if (!overtimeRequest.user.lineUserId) {
      console.warn(
        'No LINE user ID provided for overtime approval notification',
      );
      return;
    }

    const message = `Your overtime request for ${overtimeRequest.date.toDateString()} (${overtimeRequest.startTime} - ${overtimeRequest.endTime}) has been approved by ${approverId.name}.`;
    await this.sendNotification(
      overtimeRequest.employeeId,
      message,
      overtimeRequest.user.lineUserId,
    );
  }

  private async sendNotification(
    userId: string,
    message: string,
    lineUserId: string,
  ): Promise<void> {
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

  private createDigestMessage(pendingRequests: OvertimeRequest[]): FlexMessage {
    // Implement the digest message creation logic
    // Use a similar structure to your existing flex messages
    return {
      type: 'flex',
      altText: 'Overtime Requests Digest',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'Overtime Requests Digest',
              weight: 'bold',
              size: 'xl',
            },
            {
              type: 'text',
              text: `You have ${pendingRequests.length} pending overtime requests.`,
              margin: 'md',
            },
            // Add more details about the pending requests here
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
                label: 'View Requests',
                uri: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/overtime`,
              },
              style: 'primary',
            },
          ],
        },
      },
    };
  }

  private createBatchApprovalMessage(
    approvedRequests: OvertimeRequest[],
  ): FlexMessage {
    // Implement the batch approval message creation logic
    return {
      type: 'flex',
      altText: 'Overtime Requests Batch Approval',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'Overtime Requests Approved',
              weight: 'bold',
              size: 'xl',
            },
            {
              type: 'text',
              text: `You have approved ${approvedRequests.length} overtime requests.`,
              margin: 'md',
            },
            // Add more details about the approved requests here
          ],
        },
      },
    };
  }

  private createOvertimeRequestMessage(request: OvertimeRequest): FlexMessage {
    // Implement the overtime request message creation logic
    // Use the existing flex message structure from sendRequestNotification.ts
    // This is a simplified version, you should adapt it to match your existing structure
    return {
      type: 'flex',
      altText: 'New Overtime Request',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'New Overtime Request',
              weight: 'bold',
              size: 'xl',
            },
            {
              type: 'text',
              text: `Date: ${new Date(request.date).toLocaleDateString()}`,
              margin: 'md',
            },
            {
              type: 'text',
              text: `Time: ${request.startTime} - ${request.endTime}`,
            },
            {
              type: 'text',
              text: `Reason: ${request.reason}`,
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'Approve',
                data: `action=approve&requestType=overtime&requestId=${request.id}`,
              },
              style: 'primary',
            },
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'Deny',
                data: `action=deny&requestType=overtime&requestId=${request.id}`,
              },
              style: 'secondary',
            },
          ],
        },
      },
    };
  }
}

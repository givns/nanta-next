import axios from 'axios';
import { OvertimeRequest, User } from '@prisma/client';

export class NotificationService {
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
      await axios.post('/api/line-notification', { lineUserId, message });
    } catch (error) {
      console.error('Error sending LINE notification:', error);
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

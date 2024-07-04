// services/NotificationService.ts

import axios from 'axios';

export class NotificationService {
  private lineApiUrl = 'https://api.line.me/v2/bot/message/push';
  private channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  async sendNotification(userId: string, message: string): Promise<void> {
    try {
      await axios.post(
        this.lineApiUrl,
        {
          to: userId,
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
      console.log(`Notification sent to user ${userId}: ${message}`);
    } catch (error) {
      console.error('Error sending LINE notification:', error);
    }
  }

  async sendConfirmationRequest(
    userId: string,
    action: 'check-in' | 'check-out',
  ): Promise<void> {
    const message = `Do you want to confirm your ${action}?`;
    await this.sendNotification(userId, message);
  }
}

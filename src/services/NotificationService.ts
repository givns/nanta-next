// services/NotificationService.ts

import { Client } from '@line/bot-sdk';

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
}

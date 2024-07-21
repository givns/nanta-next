import axios from 'axios';

export class LineService {
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
      throw new Error('Failed to send LINE notification');
    }
  }

  async sendConfirmationRequest(
    userId: string,
    action: 'check-in' | 'check-out',
  ): Promise<void> {
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
          to: userId,
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

  async sendFlexMessage(userId: string, flexContent: any): Promise<void> {
    try {
      await axios.post(
        this.lineApiUrl,
        {
          to: userId,
          messages: [
            {
              type: 'flex',
              altText: 'Flex Message',
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
      console.log(`Flex message sent to user ${userId}`);
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
          to: userId,
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
}

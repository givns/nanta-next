// services/NotificationQueue.ts

import { Client, Message } from '@line/bot-sdk';
import { UserMappingService } from './useMappingService';
import { PrismaClient } from '@prisma/client';

interface NotificationTask {
  employeeId: string;
  message: string | Message;
  type:
    | 'check-in'
    | 'check-out'
    | 'leave'
    | 'overtime'
    | 'overtime-digest'
    | 'overtime-batch-approval'
    | 'shift';
}

export class NotificationQueue {
  private queue: NotificationTask[] = [];
  private isProcessing: boolean = false;

  constructor(
    private lineClient: Client,
    private userMappingService: UserMappingService,
  ) {}

  async addNotification(task: NotificationTask) {
    this.queue.push(task);
    console.log(`Added notification to queue: ${JSON.stringify(task)}`);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await this.sendNotification(task);
        console.log(`Successfully sent notification: ${JSON.stringify(task)}`);
      } catch (error) {
        console.error(
          `Failed to send notification: ${JSON.stringify(task)}`,
          error,
        );
        // Implement retry logic
        if (this.queue.length < 100) {
          // Prevent queue from growing too large
          this.queue.push(task);
        }
      }
    }
    this.isProcessing = false;
  }

  private async sendNotification(task: NotificationTask) {
    const lineUserId = await this.userMappingService.getLineUserId(
      task.employeeId,
    );
    if (!lineUserId) {
      throw new Error(`No LINE User ID found for employee ${task.employeeId}`);
    }

    let messageToSend: Message;
    if (typeof task.message === 'string') {
      messageToSend = { type: 'text', text: task.message };
    } else if (this.isLineMessage(task.message)) {
      messageToSend = task.message;
    } else {
      throw new Error('Invalid message format');
    }

    await this.lineClient.pushMessage(lineUserId, messageToSend);
    console.log(
      `Sent ${task.type} notification to employee ${task.employeeId}`,
    );
  }

  private isLineMessage(message: any): message is Message {
    return (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      typeof message.type === 'string'
    );
  }
}

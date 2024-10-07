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
    console.log(`Current queue length: ${this.queue.length}`);

    if (!this.isProcessing) {
      console.log('Starting queue processing');
      this.processQueue();
    } else {
      console.log('Queue is already being processed');
    }
  }

  private async processQueue() {
    this.isProcessing = true;
    console.log(`Processing queue with ${this.queue.length} items`);
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        console.log(`Processing task: ${JSON.stringify(task)}`);
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
          console.log(`Requeued failed task: ${JSON.stringify(task)}`);
        } else {
          console.warn(
            `Queue is too large, discarding failed task: ${JSON.stringify(task)}`,
          );
        }
      }
    }
    this.isProcessing = false;
    console.log('Finished processing queue');
  }

  private async sendNotification(task: NotificationTask) {
    try {
      console.log(
        `Attempting to send notification for task: ${JSON.stringify(task)}`,
      );
      const lineUserId = await this.userMappingService.getLineUserId(
        task.employeeId,
      );
      console.log(
        `Retrieved LINE User ID for employee ${task.employeeId}: ${lineUserId}`,
      );

      if (!lineUserId) {
        throw new Error(
          `No LINE User ID found for employee ${task.employeeId}`,
        );
      }

      let messageToSend: Message;
      if (typeof task.message === 'string') {
        messageToSend = JSON.parse(task.message);
      } else if (this.isLineMessage(task.message)) {
        messageToSend = task.message;
      } else {
        throw new Error('Invalid message format');
      }

      console.log(
        `Sending ${task.type} notification to LINE User ID: ${lineUserId}`,
      );
      await this.lineClient.pushMessage(lineUserId, messageToSend);
      console.log(
        `Successfully sent ${task.type} notification to employee ${task.employeeId}`,
      );
    } catch (error) {
      console.error(`Error sending notification:`, error);
      throw error; // Re-throw the error to be caught by the processQueue method
    }
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

// services/NotificationQueue.ts

import { Client } from '@line/bot-sdk';
import { PrismaClient } from '@prisma/client';

interface NotificationTask {
  userId: string;
  message: string;
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
  private lineClient: Client;
  private prisma: PrismaClient;

  constructor(lineClient: Client, prisma: PrismaClient) {
    this.lineClient = lineClient;
    this.prisma = prisma;
  }

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
    const user = await this.prisma.user.findUnique({
      where: { employeeId: task.userId },
    });
    if (!user || !user.lineUserId) {
      throw new Error(
        `User not found or no LINE User ID for user ${task.userId}`,
      );
    }
    await this.lineClient.pushMessage(user.lineUserId, {
      type: 'text',
      text: task.message,
    });
    console.log(`Sent ${task.type} notification to user ${task.userId}`);
  }
}

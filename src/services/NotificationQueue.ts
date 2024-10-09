//notificationQueue.ts
import { Client, Message } from '@line/bot-sdk';
import { UseMappingService } from './useMappingService';
import { RateLimiter } from 'Limiter';
const limiter = new RateLimiter({ tokensPerInterval: 1000, interval: 'hour' });

interface NotificationTask {
  employeeId: string;
  lineUserId: string;
  message: string | Message;
  type:
    | 'check-in'
    | 'check-out'
    | 'leave'
    | 'overtime'
    | 'overtime-digest'
    | 'overtime-batch-approval'
    | 'shift';
  retryCount?: number; // Add the 'retryCount' property
}

export class NotificationQueue {
  private queue: NotificationTask[] = [];
  private isProcessing: boolean = false;

  constructor(
    private lineClient: Client,
    private userMappingService: UseMappingService,
  ) {
    console.log('NotificationQueue initialized');
    console.log(
      'userMappingService is',
      this.userMappingService ? 'defined' : 'undefined',
    );
  }

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
        if (this.queue.length < 100) {
          task.retryCount = (task.retryCount || 0) + 1;
          if (task.retryCount <= 3) {
            this.queue.push(task);
            console.log(
              `Requeued failed task (attempt ${task.retryCount}): ${JSON.stringify(task)}`,
            );
          }
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
    await limiter.removeTokens(1);
    console.log(`Starting sendNotification for task:`, task);
    try {
      if (!task.lineUserId) {
        throw new Error(
          `No LINE User ID provided for employee ${task.employeeId}`,
        );
      }

      let messageToSend: Message;
      if (typeof task.message === 'string') {
        try {
          messageToSend = JSON.parse(task.message);
        } catch (error) {
          console.error('Error parsing message:', error);
          throw new Error('Invalid message format: unable to parse JSON');
        }
      } else if (this.isLineMessage(task.message)) {
        messageToSend = task.message;
      } else {
        throw new Error('Invalid message format');
      }

      console.log(
        `Sending ${task.type} notification to LINE User ID: ${task.lineUserId}`,
      );
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('LINE API request timed out')),
          10000,
        ),
      );
      await Promise.race([
        this.lineClient.pushMessage(task.lineUserId, messageToSend),
        timeoutPromise,
      ]);
      console.log(
        `Successfully sent ${task.type} notification to employee ${task.employeeId}`,
      );
    } catch (error) {
      console.error(`Error sending notification:`, error);
      throw error;
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

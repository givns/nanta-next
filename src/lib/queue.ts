// lib/queue.ts

import Queue from 'bull';

let registrationQueue: Queue.Queue | null = null;
let attendanceProcessingQueue: Queue.Queue | null = null;

export function getRegistrationQueue(): Queue.Queue {
  if (!registrationQueue) {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
      throw new Error('REDIS_URL is not defined in the environment variables');
    }
    registrationQueue = createQueue('user-registration', REDIS_URL);
    console.log('Registration queue initialized');
  }
  return registrationQueue;
}

export function getAttendanceProcessingQueue(): Queue.Queue {
  if (!attendanceProcessingQueue) {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
      throw new Error('REDIS_URL is not defined in the environment variables');
    }
    attendanceProcessingQueue = createQueue('attendance-processing', REDIS_URL);
    console.log('Attendance processing queue initialized');
  }
  return attendanceProcessingQueue;
}

function createQueue(name: string, redisUrl: string): Queue.Queue {
  const queue = new Queue(name, redisUrl, {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
    redis: {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    },
  });
  queue.on('error', (error) => {
    console.error(`${name} queue error:`, error);
  });
  return queue;
}

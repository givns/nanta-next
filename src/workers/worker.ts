// worker.ts

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import {
  getRegistrationQueue,
  getAttendanceProcessingQueue,
} from '../lib/queue';
import { processRegistration } from '../lib/processRegistration';
import { processAttendance } from '../lib/processAttendance';
import Queue from 'bull';

console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Load environment variables from .env.local file
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

console.log('Environment variables loaded');
console.log(
  'LINE_CHANNEL_ACCESS_TOKEN:',
  process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'Set' : 'Not set',
);
console.log('REDIS_URL:', process.env.REDIS_URL ? 'Set' : 'Not set');

const registrationQueue = getRegistrationQueue();
const attendanceProcessingQueue = getAttendanceProcessingQueue();

console.log('Worker started, connecting to queues...');

function setupQueueListeners(queue: Queue.Queue, name: string) {
  queue.on('error', (error: Error) => {
    console.error(`${name} queue error:`, error);
  });

  queue.on('waiting', (jobId: string) => {
    console.log(`${name} job waiting to be processed:`, jobId);
  });

  queue.on('active', (job: Queue.Job) => {
    console.log(`${name} job starting to be processed:`, job.id);
  });

  queue.on('completed', (job: Queue.Job, result: any) => {
    console.log(`${name} job completed:`, job.id, 'Result:', result);
  });

  queue.on('failed', (job: Queue.Job, err: Error) => {
    console.error(`${name} job failed:`, job.id, 'Error:', err);
  });
}

setupQueueListeners(registrationQueue, 'Registration');
setupQueueListeners(attendanceProcessingQueue, 'Attendance Processing');

registrationQueue.process(async (job) => {
  console.log('Processing registration job:', job.id);
  try {
    return await processRegistration(job);
  } catch (error) {
    console.error(
      'Error processing registration job:',
      job.id,
      'Error:',
      error,
    );
    throw error; // Rethrow to let Bull handle retries
  }
});

attendanceProcessingQueue.process(async (job) => {
  console.log('Processing attendance job:', job.id);
  try {
    return await processAttendance(job);
  } catch (error) {
    console.error('Error processing attendance job:', job.id, 'Error:', error);
    throw error; // Rethrow to let Bull handle retries
  }
});

console.log('Worker setup complete, waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing queues...');
  await Promise.all([
    registrationQueue.close(),
    attendanceProcessingQueue.close(),
  ]);
  console.log('Queues closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing queues...');
  await Promise.all([
    registrationQueue.close(),
    attendanceProcessingQueue.close(),
  ]);
  console.log('Queues closed');
  process.exit(0);
});

// Keep the process alive
setInterval(() => {
  console.log('Worker still running...');
}, 60000);

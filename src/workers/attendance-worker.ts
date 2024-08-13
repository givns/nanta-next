// workers/attendance-worker.ts

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { getAttendanceProcessingQueue } from '../lib/queue';
import { processAttendance } from '../lib/processAttendance';
import { logMessage } from '../utils/inMemoryLogger';
import { Job } from 'bull';

logMessage('Starting attendance worker');

dotenv.config({ path: resolve(__dirname, '../../.env.local') });

logMessage('Environment variables loaded');

const queue = getAttendanceProcessingQueue();

logMessage('Attendance worker connected to queue');

queue.on('error', (error: Error) => {
  logMessage(`Queue error: ${error.message}`);
  console.error('Queue error:', error);
});

queue.on('waiting', (jobId: string) => {
  logMessage(`Job waiting to be processed: ${jobId}`);
});

queue.on('active', (job: Job) => {
  logMessage(`Job starting to be processed: ${job.id}`);
});

queue.on('completed', (job: Job, result: any) => {
  logMessage(`Job completed: ${job.id}, Result: ${JSON.stringify(result)}`);
});

queue.on('failed', (job: Job, err: Error) => {
  logMessage(`Job failed: ${job.id}, Error: ${err.message}`);
  console.error('Job failed:', job.id, 'Error:', err);
});

queue.process('process-payroll', async (job: Job) => {
  logMessage(`Processing payroll job: ${job.id}`);
  try {
    const result = await processAttendance(job);
    logMessage(`Payroll processing completed for job: ${job.id}`);
    return result;
  } catch (error: any) {
    logMessage(
      `Error processing payroll job: ${job.id}, Error: ${error.message}`,
    );
    console.error('Error processing payroll job:', job.id, 'Error:', error);
    throw error;
  }
});

logMessage('Attendance worker setup complete, waiting for jobs...');

// Log the number of jobs in the queue every minute
setInterval(async () => {
  const jobCounts = await queue.getJobCounts();
  logMessage(`Current job counts: ${JSON.stringify(jobCounts)}`);
}, 60000);

// Keep the process alive
setInterval(() => {
  logMessage('Attendance worker still running...');
}, 60000);

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import getRegistrationQueue from '../lib/queue';
import { processRegistration } from '../lib/processRegistration';

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

const queue = getRegistrationQueue();

console.log('Worker started, connecting to queue...');

queue.on('error', (error) => {
  console.error('Queue error:', error);
});

queue.on('waiting', (jobId) => {
  console.log('Job waiting to be processed:', jobId);
});

queue.on('active', (job) => {
  console.log('Job starting to be processed:', job.id);
});

queue.on('completed', (job, result) => {
  console.log('Job completed:', job.id, 'Result:', result);
});

queue.on('failed', (job, err) => {
  console.error('Job failed:', job.id, 'Error:', err);
});

queue.process(async (job) => {
  console.log('Processing job:', job.id);
  return processRegistration(job);
});

console.log('Worker setup complete, waiting for jobs...');

// Keep the process alive
setInterval(() => {
  console.log('Worker still running...');
}, 60000);

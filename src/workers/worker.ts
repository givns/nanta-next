import { getRegistrationQueue } from '../lib/queue';

const registrationQueue = getRegistrationQueue();

console.log('Worker started, waiting for jobs...');

registrationQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error:`, err);
});

registrationQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed with result:`, result);
});

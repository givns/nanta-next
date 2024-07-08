import Queue from 'bull';
import { processRegistration } from './processRegistration';

let registrationQueue: Queue.Queue | null = null;

export function getRegistrationQueue(): Queue.Queue {
  if (!registrationQueue) {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
      throw new Error('REDIS_URL is not defined in the environment variables');
    }
    registrationQueue = new Queue('user-registration', REDIS_URL, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });
    registrationQueue.on('error', (error) => {
      console.error('Queue error:', error);
    });
    console.log('Registration queue initialized');
  }
  return registrationQueue;
}

// Process jobs in a separate file/service, not in the API route
if (process.env.WORKER_PROCESS === 'true') {
  const queue = getRegistrationQueue();
  queue.process(processRegistration);
  console.log('Worker started, processing jobs...');
}

export default getRegistrationQueue;

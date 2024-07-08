import Queue from 'bull';
import { processRegistration } from './processRegistration';

let registrationQueue: Queue.Queue<any> | null = null;

function initializeQueue(): Queue.Queue<any> {
  const REDIS_URL = process.env.REDIS_URL;
  if (!REDIS_URL) {
    throw new Error('REDIS_URL is not defined in the environment variables');
  }

  const queue = new Queue('user-registration', REDIS_URL, {
    redis: {
      tls: {
        rejectUnauthorized: false,
      },
    },
  });

  queue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed with error:`, err);
  });

  queue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed with result:`, result);
  });

  queue.process(processRegistration);

  console.log('Registration queue initialized');
  return queue;
}

export function getRegistrationQueue(): Queue.Queue<any> {
  if (!registrationQueue) {
    registrationQueue = initializeQueue();
  }
  return registrationQueue;
}

// Export a singleton instance of the queue
export default getRegistrationQueue;

import Queue from 'bull';
import { processRegistration } from './processRegistration';

let registrationQueue: Queue.Queue<any> | null = null;

export function getRegistrationQueue(): Queue.Queue<any> {
  if (!registrationQueue) {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
      throw new Error('REDIS_URL is not defined in the environment variables');
    }
    registrationQueue = new Queue('user-registration', REDIS_URL, {
      redis: {
        tls: {
          rejectUnauthorized: false,
        },
      },
    });

    registrationQueue.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed with error:`, err);
    });

    registrationQueue.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed with result:`, result);
    });

    registrationQueue.process(processRegistration);

    console.log('Registration queue initialized');
  }
  return registrationQueue;
}

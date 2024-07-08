import Queue from 'bull';
import { processRegistration } from './processRegistration';

let registrationQueue: Queue.Queue | null = null;

export function getRegistrationQueue(): Queue.Queue {
  if (!registrationQueue) {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
      throw new Error('REDIS_URL is not defined in the environment variables');
    }
    registrationQueue = new Queue('user-registration', REDIS_URL);

    // Type assertion to access 'on' method
    (registrationQueue as any).on('failed', (job: any, err: Error) => {
      console.error(`Job ${job.id} failed with error:`, err);
    });

    (registrationQueue as any).on('completed', (job: any, result: any) => {
      console.log(`Job ${job.id} completed with result:`, result);
    });

    registrationQueue.process(processRegistration);

    console.log('Registration queue initialized');
  }
  return registrationQueue;
}

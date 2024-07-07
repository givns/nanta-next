import Queue from 'bull';
import processRegistration from './registrationWorker';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error('REDIS_URL is not defined in the environment variables');
}

const registrationQueue = new Queue('user-registration', REDIS_URL);

registrationQueue.process(processRegistration);

console.log('Worker started');

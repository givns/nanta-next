import { getRegistrationQueue } from '../lib/queue';

const registrationQueue = getRegistrationQueue();

console.log('Worker started, waiting for jobs...');

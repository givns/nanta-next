import * as dotenv from 'dotenv';
import { resolve } from 'path';

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

import getRegistrationQueue from '../lib/queue';

const registrationQueue = getRegistrationQueue();

console.log('Registration queue initialized');
console.log('Worker started, waiting for jobs...');

// Keep the process alive
setInterval(() => {
  console.log('Worker still running...');
}, 60000);

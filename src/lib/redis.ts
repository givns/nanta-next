import { Redis } from 'ioredis';

let redis: Redis | null = null;

// Check if we're in a Node.js environment and have Redis URL
if (
  typeof process !== 'undefined' &&
  process.env.NODE_ENV !== 'test' &&
  process.env.REDIS_URL
) {
  try {
    redis = new Redis(process.env.REDIS_URL);
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
  }
}

export default redis;

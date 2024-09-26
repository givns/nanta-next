// lib/redis.ts

import Redis from 'ioredis';

let redis: Redis | null = null;

if (typeof window === 'undefined' && process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
}

export default redis;

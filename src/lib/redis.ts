// lib/redis.ts

import Redis from 'ioredis';
import { getCurrentTime } from '@/utils/dateUtils';

let redisClient: Redis | null = null;

export function getRedisClient() {
  if (!redisClient) {
    try {
      const redisUrl = process.env.REDIS_URL;

      if (!redisUrl) {
        console.warn('REDIS_URL not set, Redis caching will be disabled');
        return null;
      }

      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 1000, 3000),
        lazyConnect: true, // Important: Only connect when needed
        enableOfflineQueue: false,
      });

      redisClient.on('connect', () => {
        console.info(`Redis connected at ${getCurrentTime().toISOString()}`);
      });

      redisClient.on('error', (err) => {
        console.error('Redis error:', err);
        redisClient = null;
      });
    } catch (error) {
      console.error('Redis initialization failed:', error);
      redisClient = null;
    }
  }
  return redisClient;
}

export function closeRedis() {
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
}

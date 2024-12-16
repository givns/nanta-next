// lib/redis.ts

import Redis from 'ioredis';
let redisClient: Redis | null = null;

export function initializeRedis() {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('REDIS_URL not set, Redis caching will be disabled');
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 1000, 3000),
      connectTimeout: 10000,
      enableReadyCheck: true,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    redisClient
      .on('connect', () => console.info('Redis: Establishing connection...'))
      .on('ready', () =>
        console.info('Redis: Connection established and ready'),
      )
      .on('error', (err) => {
        console.error('Redis error:', err);
        redisClient = null;
      })
      .on('close', () => {
        console.warn('Redis: Connection closed');
        redisClient = null;
      });

    return redisClient;
  } catch (error) {
    console.error('Redis initialization error:', error);
    return null;
  }
}

export function getRedisClient() {
  if (!redisClient) {
    return initializeRedis();
  }
  return redisClient;
}

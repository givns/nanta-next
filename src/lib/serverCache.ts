// lib/serverCache.ts

import redis from './redis';

export async function getCacheData(key: string): Promise<string | null> {
  if (!redis) return null;
  return redis.get(key);
}

export async function setCacheData(
  key: string,
  value: string,
  expirationInSeconds?: number,
): Promise<void> {
  if (!redis) return;
  if (expirationInSeconds) {
    await redis.set(key, value, 'EX', expirationInSeconds);
  } else {
    await redis.set(key, value);
  }
}

export async function deleteCacheData(key: string): Promise<void> {
  if (!redis) return;
  await redis.del(key);
}

export async function invalidateCachePattern(pattern: string): Promise<void> {
  if (!redis) return;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

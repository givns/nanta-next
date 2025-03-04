// lib/upstash.ts
import { Redis } from '@upstash/redis';

// Create a Redis client that works in both serverless and Edge environments
export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Cache helper function
export async function getWithCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl = 30, // 30 seconds cache by default
): Promise<T> {
  try {
    // Try to get from cache first
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    // Not in cache, fetch data
    const data = await fetchFn();

    // Store in cache (don't await this to avoid blocking)
    redis.set(key, data, { ex: ttl }).catch((err) => {
      console.warn('Redis cache set error:', err);
    });

    return data;
  } catch (err) {
    console.warn('Redis cache error, falling back to direct fetch:', err);
    return fetchFn();
  }
}

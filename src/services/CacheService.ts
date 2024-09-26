// services/CacheService.ts
import Redis from 'ioredis';

class CacheService {
  private client: Redis | null = null;

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.client = new Redis(redisUrl);
      this.client.on('error', (error) => {
        console.error('Redis error:', error);
      });
    } else {
      console.warn('REDIS_URL is not set. Caching will be disabled.');
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    expirationInSeconds?: number,
  ): Promise<void> {
    if (!this.client) return;
    if (expirationInSeconds) {
      await this.client.set(key, value, 'EX', expirationInSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.client) return;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

export const cacheService = new CacheService();

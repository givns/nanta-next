// services/CacheService.ts
import Redis from 'ioredis';

class CacheService {
  private client: any = null;

  constructor() {
    if (typeof window === 'undefined') {
      this.initializeRedis();
    }
  }

  private async initializeRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const Redis = await import('ioredis');
        this.client = new Redis.default(redisUrl);
        this.client.on('error', (error: any) => {
          console.error('Redis error:', error);
        });
      } catch (error) {
        console.error('Failed to initialize Redis:', error);
      }
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

export const cacheService =
  typeof window === 'undefined' ? new CacheService() : null;

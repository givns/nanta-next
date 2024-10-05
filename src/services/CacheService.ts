// services/CacheService.ts

class CacheService {
  private client: any = null;

  constructor() {
    if (typeof window === 'undefined') {
      this.initializeRedis();
    }
  }
  private locks: Map<string, Promise<any>> = new Map();
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
    const cachedData = await this.client.get(key);
    if (cachedData) {
      console.log(`Cache hit for key: ${key}`);
      return cachedData;
    }
    console.log(`Cache miss for key: ${key}`);
    return null;
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

  async getWithSWR(
    key: string,
    fetchFunction: () => Promise<any>,
    ttl: number,
  ): Promise<any> {
    // Check if there's an ongoing request for this key
    if (this.locks.has(key)) {
      console.log(`Waiting for ongoing request for key: ${key}`);
      return this.locks.get(key);
    }

    const cachedData = await this.get(key);

    if (cachedData) {
      // Asynchronously update the cache
      this.locks.set(
        key,
        fetchFunction().then((newData) => {
          this.set(key, JSON.stringify(newData), ttl);
          this.locks.delete(key);
          return newData;
        }),
      );
      return JSON.parse(cachedData);
    }

    // If no cached data, fetch fresh data
    const fetchPromise = fetchFunction().then((freshData) => {
      this.set(key, JSON.stringify(freshData), ttl);
      this.locks.delete(key);
      return freshData;
    });

    this.locks.set(key, fetchPromise);
    return fetchPromise;
  }
}
export const cacheService =
  typeof window === 'undefined' ? new CacheService() : null;

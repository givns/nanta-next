import { Redis } from 'ioredis';

class CacheService {
  private client: Redis | null = null;
  private locks: Map<string, Promise<any>> = new Map();
  private memoryCache: Map<string, { data: any; timestamp: number }> =
    new Map();
  private isTest: boolean = process.env.NODE_ENV === 'test';
  private MEMORY_CACHE_TTL = 5000; //

  constructor() {
    if (!this.isTest) {
      this.initializeRedis();
    }
  }

  // Add memory cache methods
  private getFromMemoryCache(key: string) {
    const cached = this.memoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.MEMORY_CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  private setInMemoryCache(key: string, data: any) {
    this.memoryCache.set(key, { data, timestamp: Date.now() });
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
    // Check memory cache first
    const memoryCached = this.getFromMemoryCache(key);
    if (memoryCached) return memoryCached;

    if (this.isTest || !this.client) return null;

    const cachedData = await this.client.get(key);
    if (cachedData) {
      this.setInMemoryCache(key, cachedData);
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
    if (this.isTest || !this.client) return;
    if (expirationInSeconds) {
      await this.client.set(key, value, 'EX', expirationInSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (this.isTest || !this.client) return;
    await this.client.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (this.isTest || !this.client) return;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async getWithSWR<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl: number,
  ): Promise<T> {
    // Check memory cache first
    const memoryCached = this.getFromMemoryCache(key);
    if (memoryCached) return memoryCached;

    if (this.isTest) {
      return fetchFunction();
    }

    // Check if there's an ongoing request
    if (this.locks.has(key)) {
      console.log(`Waiting for ongoing request for key: ${key}`);
      return this.locks.get(key);
    }

    const cachedData = await this.get(key);
    if (cachedData) {
      // Background refresh
      this.locks.set(
        key,
        (async () => {
          try {
            const newData = await fetchFunction();
            await this.set(key, JSON.stringify(newData), ttl);
            this.setInMemoryCache(key, newData);
            return newData;
          } finally {
            this.locks.delete(key);
          }
        })(),
      );
      return JSON.parse(cachedData);
    }

    // If no cached data, fetch fresh
    const fetchPromise = (async () => {
      try {
        const freshData = await fetchFunction();
        await this.set(key, JSON.stringify(freshData), ttl);
        this.setInMemoryCache(key, freshData);
        return freshData;
      } finally {
        this.locks.delete(key);
      }
    })();

    this.locks.set(key, fetchPromise);
    return fetchPromise;
  }
}

// Export a singleton instance
const cacheService = new CacheService();
export { cacheService };

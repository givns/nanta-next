// services/cache/CacheService.ts
import { Redis } from 'ioredis';
import { z } from 'zod';
import { redisManager } from '../RedisConnectionManager';

interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
  latency: number[];
}

export class CacheService {
  private client: Redis | null = null;
  private locks: Map<string, Promise<any>> = new Map();
  private memoryCache: Map<string, { data: any; timestamp: number }> =
    new Map();
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    errors: 0,
    latency: [],
  };

  private readonly MEMORY_CACHE_TTL = 5000; // 5 seconds
  private readonly IS_CLIENT = typeof window !== 'undefined';
  private isInitialized = false;

  constructor() {
    if (!this.IS_CLIENT) {
      this.initializeRedis();
    } else {
      console.debug('Using memory-only cache on client side');
    }
  }

  private async initializeRedis() {
    if (this.IS_CLIENT || this.isInitialized) return;

    try {
      console.debug('Initializing Redis connection for CacheService');

      // Initialize the Redis manager
      await redisManager.initialize();

      // Get the shared client
      this.client = redisManager.getClient();

      if (this.client) {
        this.isInitialized = true;
        console.info('CacheService: Using shared Redis connection');
      } else {
        console.warn(
          'CacheService: Redis client not available, using memory-only cache',
        );
      }
    } catch (error) {
      console.error('Failed to initialize Redis for CacheService:', error);
      this.recordError('redis_init_failed');
      console.info('Falling back to memory-only cache');
    }
  }

  getRedisClient(): Redis | null {
    return this.client;
  }

  private recordError(type: string) {
    this.metrics.errors++;
    console.error(`Cache error: ${type}`);
  }

  private async measureOperation<T>(
    operation: () => Promise<T>,
    name: string,
  ): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      const duration = performance.now() - start;
      this.metrics.latency.push(duration);
      console.debug(`Cache operation ${name} took ${duration.toFixed(2)}ms`);
    }
  }

  private getFromMemoryCache(key: string): any | null {
    const cached = this.memoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.MEMORY_CACHE_TTL) {
      this.metrics.hits++;
      return cached.data;
    }
    this.metrics.misses++;
    return null;
  }

  private setInMemoryCache(key: string, data: any) {
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.IS_CLIENT) {
      return this.getFromMemoryCache(key);
    }

    return this.measureOperation(async () => {
      const memoryCached = this.getFromMemoryCache(key);
      if (memoryCached) return memoryCached;

      if (!this.client) return null;

      try {
        const cachedData = await this.client.get(key);
        if (cachedData) {
          this.setInMemoryCache(key, cachedData);
          this.metrics.hits++;
          return cachedData;
        }
        this.metrics.misses++;
        return null;
      } catch (error) {
        this.recordError('get_failed');
        console.error('Cache get failed:', error);
        return null; // Return null instead of throwing to avoid breaking the application
      }
    }, 'get');
  }

  async set(
    key: string,
    value: string,
    expirationInSeconds?: number,
  ): Promise<void> {
    if (this.IS_CLIENT) {
      this.setInMemoryCache(key, value);
      return;
    }

    return this.measureOperation(async () => {
      if (!this.client) {
        this.setInMemoryCache(key, value);
        return;
      }

      try {
        if (expirationInSeconds) {
          await this.client.set(key, value, 'EX', expirationInSeconds);
        } else {
          await this.client.set(key, value);
        }
        this.setInMemoryCache(key, value);
      } catch (error) {
        this.recordError('set_failed');
        console.error('Cache set failed:', error);
        // Still set in memory cache as fallback
        this.setInMemoryCache(key, value);
      }
    }, 'set');
  }

  async getWithSWR<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl: number,
    schema?: z.ZodType<T>,
  ): Promise<T> {
    return this.measureOperation(async () => {
      const memoryCached = this.getFromMemoryCache(key);
      if (memoryCached) {
        try {
          const parsed =
            typeof memoryCached === 'string'
              ? JSON.parse(memoryCached)
              : memoryCached;
          if (schema) {
            return schema.parse(parsed);
          }
          return parsed;
        } catch (error) {
          console.warn(`Invalid cached data for key ${key}:`, error);
          this.recordError('cache_parse_failed');
        }
      }

      if (this.locks.has(key)) {
        return this.locks.get(key);
      }

      const fetchAndCache = async () => {
        try {
          const data = await fetchFunction();
          const serialized = JSON.stringify(data);
          await this.set(key, serialized, ttl);
          this.setInMemoryCache(key, data);
          return data;
        } finally {
          this.locks.delete(key);
        }
      };

      const fetchPromise = fetchAndCache();
      this.locks.set(key, fetchPromise);
      return fetchPromise;
    }, 'getWithSWR');
  }

  async invalidatePattern(pattern: string): Promise<void> {
    return this.measureOperation(async () => {
      // Remove from memory cache by pattern matching
      for (const key of this.memoryCache.keys()) {
        if (key.includes(pattern.replace('*', ''))) {
          this.memoryCache.delete(key);
        }
      }

      if (!this.client) return;

      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } catch (error) {
        this.recordError('invalidate_pattern_failed');
        console.error('Failed to invalidate pattern:', error);
        // Continue without throwing to avoid breaking the application
      }
    }, 'invalidatePattern');
  }

  async del(key: string): Promise<void> {
    return this.measureOperation(async () => {
      // Always clean memory cache
      this.memoryCache.delete(key);

      if (!this.client) return;

      try {
        await this.client.del(key);
      } catch (error) {
        this.recordError('del_failed');
        console.error('Failed to delete key:', error);
        // Continue without throwing to avoid breaking the application
      }
    }, 'del');
  }

  getMetrics(): CacheMetrics {
    return {
      ...this.metrics,
      latency: [...this.metrics.latency],
    };
  }

  clearMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      latency: [],
    };
  }
}

export const cacheService = new CacheService();

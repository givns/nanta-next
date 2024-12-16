import { getRedisClient } from '@/lib/redis';
import { Redis } from 'ioredis';
import { z } from 'zod';

interface CacheOptions {
  ttl?: number;
  namespace?: string;
}

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
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly IS_CLIENT = typeof window !== 'undefined';

  constructor() {
    if (!this.IS_CLIENT) {
      this.initializeRedis();
    } else {
      console.debug('Using memory-only cache on client side');
    }
  }

  private async initializeRedis() {
    if (this.IS_CLIENT) return;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.warn('REDIS_URL is not set. Using memory-only cache.');
      return;
    }

    try {
      console.debug(
        'Initializing Redis with URL pattern:',
        redisUrl.replace(/(:.*@)/, ':****@'),
      );

      this.client = getRedisClient(); // Use the getRedisClient from lib/redis.ts

      // Wait for connection before proceeding
      await new Promise<void>((resolve, reject) => {
        this.client!.once('ready', () => {
          console.info('Redis: Connection established and ready');
          resolve();
        });

        this.client!.once('error', (err) => {
          console.error('Redis initial connection error:', err);
          reject(err);
        });

        // Add connection timeout
        setTimeout(() => reject(new Error('Redis connection timeout')), 10000);
      });

      this.setupRedisEventListeners();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.recordError('redis_init_failed');
      console.info('Falling back to memory-only cache');
    }
  }

  private setupRedisEventListeners() {
    if (!this.client) return;

    this.client
      .on('connect', () => console.info('Redis: Establishing connection...'))
      .on('ready', () =>
        console.info('Redis: Connection established and ready'),
      )
      .on('error', (err) => console.error('Redis error:', err.message))
      .on('close', () => console.warn('Redis: Connection closed'))
      .on('reconnecting', (ms: any) =>
        console.info(`Redis: Reconnecting in ${ms}ms`),
      )
      .on('end', () => console.warn('Redis: Connection ended'));
  }

  private recordError(type: string) {
    this.metrics.errors++;
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
        throw error;
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
      if (!this.client) return;

      try {
        if (expirationInSeconds) {
          await this.client.set(key, value, 'EX', expirationInSeconds);
        } else {
          await this.client.set(key, value);
        }
        this.setInMemoryCache(key, value);
      } catch (error) {
        this.recordError('set_failed');
        throw error;
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
      if (!this.client) return;

      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
          for (const key of this.memoryCache.keys()) {
            if (key.includes(pattern.replace('*', ''))) {
              this.memoryCache.delete(key);
            }
          }
        }
      } catch (error) {
        this.recordError('invalidate_pattern_failed');
        throw error;
      }
    }, 'invalidatePattern');
  }

  async del(key: string): Promise<void> {
    return this.measureOperation(async () => {
      if (!this.client) return;

      try {
        await this.client.del(key);
        this.memoryCache.delete(key);
      } catch (error) {
        this.recordError('del_failed');
        throw error;
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

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
  private readonly IS_TEST = process.env.NODE_ENV === 'test';
  private async checkRedisHealth(): Promise<boolean> {
    if (!this.client) return false;

    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  constructor() {
    if (!this.IS_TEST) {
      this.initializeRedis();
      // Check Redis health every 30 seconds
      setInterval(async () => {
        const isHealthy = await this.checkRedisHealth();
        if (!isHealthy) {
          console.warn(
            'Redis health check failed, reinitializing connection...',
          );
          await this.initializeRedis();
        }
      }, 30000);
    }
  }

  private async initializeRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.warn('REDIS_URL is not set. Caching will be disabled.');
      return;
    }

    try {
      // Add debug logging
      console.debug(
        'Initializing Redis with URL pattern:',
        redisUrl.replace(/(:.*@)/, ':****@'),
      ); // Hide credentials in logs

      const Redis = await import('ioredis');
      this.client = new Redis.default(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 1000, 3000);
          console.debug(`Redis retry attempt ${times} with delay ${delay}ms`);
          return delay;
        },
        connectTimeout: 10000, // 10 seconds
        enableReadyCheck: true,
        enableOfflineQueue: true,
        reconnectOnError: (err) => {
          console.error('Redis reconnect error:', err.message);
          return true; // Always try to reconnect
        },
      });

      // Add more detailed event listeners
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
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.recordError('redis_init_failed');
      // Fallback to memory-only cache
      console.info('Falling back to memory-only cache');
    }
  }

  private handleRedisError(error: Error) {
    console.error('Redis error:', error);
    this.recordError('redis_operation_failed');
  }

  private recordError(type: string) {
    this.metrics.errors++;
    // Could expand this to include error types, timestamps, etc.
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
    return this.measureOperation(async () => {
      // Check memory cache first
      const memoryCached = this.getFromMemoryCache(key);
      if (memoryCached) return memoryCached;

      if (this.IS_TEST || !this.client) return null;

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
    return this.measureOperation(async () => {
      if (this.IS_TEST || !this.client) return;

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
      // Check memory cache first
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

      // Check for ongoing requests
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
      if (this.IS_TEST || !this.client) return;

      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
          // Clear memory cache for matching keys
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
      if (this.IS_TEST || !this.client) return;

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

  // Helper method to clear metrics (useful for testing)
  clearMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      latency: [],
    };
  }
}

// Export a singleton instance
export const cacheService = new CacheService();

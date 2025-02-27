// services/cache/CacheService.ts
import { Redis } from 'ioredis';
import { z } from 'zod';

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

  // Cache configuration
  private readonly MEMORY_CACHE_TTL = 5000; // 5 seconds
  private readonly IS_CLIENT = typeof window !== 'undefined';
  private readonly OPERATION_TIMEOUT = 3000; // 3 seconds timeout for Redis operations
  private isInitialized = false;

  // Add bypass capability
  private bypassEndpoints = [
    '/api/attendance/status/',
    '/api/attendance/clear-cache',
  ];
  private forceBypassRedis = false;

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

      const Redis = await import('ioredis');
      this.client = new Redis.default(redisUrl, {
        maxRetriesPerRequest: 2, // Reduced from 5
        retryStrategy: (times: number) => {
          // Exponential backoff with jitter
          const delay = Math.min(times * 500, 5000); // Reduced delay
          return delay + Math.random() * 500;
        },
        connectTimeout: 5000, // Reduced from 15000
        enableReadyCheck: true,
        enableOfflineQueue: true,
        lazyConnect: true,
        reconnectOnError: (err) => {
          console.error('Redis reconnect error:', err.message);
          return true;
        },
      });

      // Don't wait for connection - this avoids blocking initialization
      this.client.once('ready', () => {
        console.info('Redis: Connection established and ready');
        this.isInitialized = true;
      });

      this.setupRedisEventListeners();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.recordError('redis_init_failed');
      console.info('Falling back to memory-only cache');
    }
  }

  getRedisClient(): Redis | null {
    return this.client;
  }

  setForceBypass(bypass: boolean): void {
    this.forceBypassRedis = bypass;
  }

  // Check if Redis should be bypassed
  private shouldBypassRedis(): boolean {
    // Always bypass if forced
    if (this.forceBypassRedis) {
      return true;
    }

    // Check current endpoint if in browser
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      return this.bypassEndpoints.some((endpoint) => path.includes(endpoint));
    }

    return false;
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
    // Always check memory cache first
    const memoryCached = this.getFromMemoryCache(key);
    if (memoryCached) return memoryCached;

    // If client-side or bypass, don't try Redis
    if (this.IS_CLIENT || this.shouldBypassRedis()) {
      return null;
    }

    return this.measureOperation(async () => {
      if (!this.client || !this.isInitialized) return null;

      try {
        // Use timeout to prevent hanging
        const redisPromise = this.client.get(key);
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(
            () => reject(new Error('Redis get timeout')),
            this.OPERATION_TIMEOUT,
          );
        });

        const cachedData = await Promise.race([redisPromise, timeoutPromise]);

        if (cachedData) {
          this.setInMemoryCache(key, cachedData);
          this.metrics.hits++;
          return cachedData;
        }
        this.metrics.misses++;
        return null;
      } catch (error) {
        console.warn(`Redis get failed for key ${key}:`, error);
        this.recordError('get_failed');
        return null; // Return null instead of throwing
      }
    }, 'get');
  }

  async set(
    key: string,
    value: string,
    expirationInSeconds?: number,
  ): Promise<void> {
    // Always update memory cache
    this.setInMemoryCache(key, value);

    // If client-side or bypass, don't try Redis
    if (this.IS_CLIENT || this.shouldBypassRedis()) {
      return;
    }

    return this.measureOperation(async () => {
      if (!this.client || !this.isInitialized) return;

      try {
        // Use timeout to prevent hanging
        const setOperation = async () => {
          if (expirationInSeconds) {
            await this.client!.set(key, value, 'EX', expirationInSeconds);
          } else {
            await this.client!.set(key, value);
          }
        };

        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(
            () => reject(new Error('Redis set timeout')),
            this.OPERATION_TIMEOUT,
          );
        });

        await Promise.race([setOperation(), timeoutPromise]);
      } catch (error) {
        console.warn(`Redis set failed for key ${key}:`, error);
        this.recordError('set_failed');
        // Continue without failing - memory cache is already updated
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
      // Clear memory cache keys matching pattern
      for (const key of this.memoryCache.keys()) {
        if (key.includes(pattern.replace('*', ''))) {
          this.memoryCache.delete(key);
        }
      }

      // If client-side or bypass, don't try Redis
      if (this.IS_CLIENT || this.shouldBypassRedis()) {
        return;
      }

      if (!this.client || !this.isInitialized) return;

      try {
        // Get keys matching pattern
        const keysPromise = this.client.keys(pattern);
        const timeoutPromise = new Promise<string[]>((_, reject) => {
          setTimeout(
            () => reject(new Error('Redis keys timeout')),
            this.OPERATION_TIMEOUT,
          );
        });

        const keys = await Promise.race([keysPromise, timeoutPromise]);

        if (keys.length > 0) {
          // Delete keys in small batches to avoid timeouts
          const batchSize = 10;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            try {
              await this.client.del(...batch);
            } catch (error) {
              console.warn(`Failed to delete batch of keys: ${error}`);
            }
          }
        }
      } catch (error) {
        console.warn(
          `Redis invalidatePattern failed for pattern ${pattern}:`,
          error,
        );
        this.recordError('invalidate_pattern_failed');
        // Continue without failing - memory cache is already updated
      }
    }, 'invalidatePattern');
  }

  async del(key: string): Promise<void> {
    // Always clear memory cache
    this.memoryCache.delete(key);

    // If client-side or bypass, don't try Redis
    if (this.IS_CLIENT || this.shouldBypassRedis()) {
      return;
    }

    return this.measureOperation(async () => {
      if (!this.client || !this.isInitialized) return;

      try {
        const delPromise = this.client.del(key);
        const timeoutPromise = new Promise<number>((_, reject) => {
          setTimeout(
            () => reject(new Error('Redis del timeout')),
            this.OPERATION_TIMEOUT,
          );
        });

        await Promise.race([delPromise, timeoutPromise]);
      } catch (error) {
        console.warn(`Redis del failed for key ${key}:`, error);
        this.recordError('del_failed');
        // Continue without failing - memory cache is already cleared
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

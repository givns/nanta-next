// services/RedisConnectionManager.ts
import Redis from 'ioredis';

/**
 * Singleton class to manage Redis connections across the application
 * to prevent connection limit issues
 */
export class RedisConnectionManager {
  private static instance: RedisConnectionManager;
  private client: Redis | null = null;
  private isInitialized = false;

  private constructor() {
    this.initialize().catch((err) => {
      console.error('Failed to initialize Redis connection:', err);
    });
  }

  static getInstance(): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager();
    }
    return RedisConnectionManager.instance;
  }

  /**
   * Initialize the Redis connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        console.warn(
          'REDIS_URL is not set. Redis functionality will be disabled.',
        );
        return;
      }

      // Create Redis client with optimized settings for serverless
      // Update in RedisConnectionManager.ts
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 5, // Increased from 2
        connectTimeout: 10000, // Increased from 5000
        commandTimeout: 3000, // Add explicit command timeout
        retryStrategy: (times) => {
          if (times > 5) return null; // Increased from 2
          return Math.min(times * 200, 1000); // More aggressive backoff
        },
        enableReadyCheck: true,
        enableOfflineQueue: true,
        reconnectOnError: (err) => {
          // Only reconnect on specific errors
          const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED'];
          return targetErrors.includes(err.message);
        },
        lazyConnect: false,
        family: 4, // Explicitly use IPv4
        db: 0, // Explicitly set database
      });

      // Set up event listeners for better observability
      this.client.on('connect', () => {
        console.info('Redis: Connection established');
      });

      this.client.on('error', (err) => {
        console.error('Redis error:', err);
      });

      this.client.on('close', () => {
        console.warn('Redis: Connection closed');
        this.isInitialized = false;
      });

      this.client.on('reconnecting', () => {
        console.info('Redis: Reconnecting...');
      });

      // Wait for connection to be ready
      await this.client.ping();
      this.isInitialized = true;
      console.log('Redis connection manager initialized');
    } catch (error) {
      console.error('Failed to initialize Redis connection manager:', error);
      this.client = null;
    }
  }

  /**
   * Get the shared Redis client instance
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Perform a Redis operation with built-in error handling and fallback
   */
  async safeExecute<T>(
    operation: (redis: Redis) => Promise<T>,
    fallbackValue: T,
  ): Promise<T> {
    if (!this.client || !this.isInitialized) {
      return fallbackValue;
    }

    try {
      return await operation(this.client);
    } catch (error) {
      console.error('Redis operation failed:', error);
      return fallbackValue;
    }
  }

  /**
   * Safely get a value from Redis with fallback
   */
  async safeGet(key: string): Promise<string | null> {
    return this.safeExecute((redis) => redis.get(key), null);
  }

  /**
   * Safely set a value in Redis, ignoring errors
   */
  async safeSet(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.client || !this.isInitialized) return;

    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      console.error('Redis set operation failed:', error);
      // Continue without failing
    }
  }

  /**
   * Closes the Redis connection - should be called when shutting down
   */
  async cleanup(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.isInitialized = false;
        console.log('Redis connection closed');
      } catch (error) {
        console.error('Error closing Redis connection:', error);
      }
    }
  }
}

// Export a singleton instance
export const redisManager = RedisConnectionManager.getInstance();

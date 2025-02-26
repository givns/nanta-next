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
  private failureCount = 0;
  private circuitOpen = false;
  private lastFailureTime = 0;

  private constructor() {
    this.initialize().catch((err) => {
      console.error('Failed to initialize Redis connection:', err);
    });
  }

  /**
   * Checks if the Redis connection is working properly
   * @returns A detailed status object with connection health information
   */
  async checkConnection(): Promise<{
    isConnected: boolean;
    pingLatency?: number;
    errorMessage?: string;
    lastConnectAttempt: Date;
  }> {
    const result = {
      isConnected: false,
      lastConnectAttempt: new Date(),
    };

    if (!this.client) {
      return {
        ...result,
        errorMessage: 'Redis client is not initialized',
      };
    }

    try {
      // Measure ping latency
      const startTime = performance.now();
      await this.client.ping();
      const pingLatency = performance.now() - startTime;

      return {
        isConnected: true,
        pingLatency,
        lastConnectAttempt: new Date(),
      };
    } catch (error) {
      console.error('Redis connection check failed:', error);
      return {
        ...result,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
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

      console.log('Initializing Redis connection...', {
        url: redisUrl.replace(/(:.*@)/, ':****@'), // Hide credentials
        timestamp: new Date().toISOString(),
      });

      // Create Redis client with optimized settings for serverless
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 5, // Increased from 2
        connectTimeout: 15000, // Increased from 5000
        commandTimeout: 5000, // Add explicit command timeout
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

      try {
        const pingResult = await Promise.race([
          this.client.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 5000),
          ),
        ]);

        this.isInitialized = true;
        console.log('Redis connection successful:', {
          pingResult,
          timestamp: new Date().toISOString(),
        });
      } catch (timeoutError) {
        console.error('Redis connection timeout:', timeoutError);
        throw timeoutError;
      }

      // Set up event listeners...
    } catch (error) {
      console.error('Failed to initialize Redis connection manager:', error);
      this.client = null;
      throw error;
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
    if (this.circuitOpen) {
      // Check if circuit should be closed again
      if (Date.now() - this.lastFailureTime > 30000) {
        // 30 seconds
        this.circuitOpen = false;
        this.failureCount = 0;
      } else {
        return fallbackValue; // Circuit is open, use fallback immediately
      }
    }

    // Rest of your existing method...
    try {
      // Operation with timeout
      const result = await Promise.race([
        operation(this.client!),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), 3000),
        ),
      ]);
      this.failureCount = 0;
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // Open circuit if too many failures
      if (this.failureCount >= 5) {
        this.circuitOpen = true;
        console.warn('Redis circuit opened due to multiple failures');
      }

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

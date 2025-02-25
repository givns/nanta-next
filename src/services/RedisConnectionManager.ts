// services/RedisConnectionManager.ts
import Redis from 'ioredis';

/**
 * Singleton class to manage Redis connections across the application
 * to prevent connection limit issues
 */
export class RedisConnectionManager {
  private static instance: RedisConnectionManager;
  private client: Redis | null = null;
  private subscribers: Map<string, Redis> = new Map();
  private isInitialized = false;

  private constructor() {}

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

      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          // Exponential backoff with a maximum delay
          return Math.min(times * 500, 3000);
        },
        connectTimeout: 10000,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      // Set up event listeners
      this.client.on('connect', () =>
        console.info('Redis: Connection established'),
      );
      this.client.on('error', (err) => console.error('Redis error:', err));
      this.client.on('close', () => console.warn('Redis: Connection closed'));
      this.client.on('reconnecting', () =>
        console.info('Redis: Reconnecting...'),
      );

      this.isInitialized = true;
      console.log('Redis connection manager initialized');
    } catch (error) {
      console.error('Failed to initialize Redis connection manager:', error);
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
   * Get a dedicated subscriber connection for pub/sub operations
   * This is necessary because a Redis client used for pub/sub cannot be used for other commands
   */
  getSubscriber(id: string): Redis | null {
    if (!this.client) return null;

    if (!this.subscribers.has(id)) {
      // Create a new connection with the same config
      const subscriber = new Redis(this.client.options as any);
      this.subscribers.set(id, subscriber);
    }

    return this.subscribers.get(id) || null;
  }

  /**
   * Close all connections - important for cleanup
   */
  async cleanup(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    if (this.client) {
      closePromises.push(this.client.quit().then(() => {}));
    }

    for (const subscriber of this.subscribers.values()) {
      closePromises.push(subscriber.quit().then(() => {}));
    }

    await Promise.all(closePromises);
    this.subscribers.clear();
    this.client = null;
    this.isInitialized = false;
  }
}

// Export a singleton instance
export const redisManager = RedisConnectionManager.getInstance();

// services/RedisConnectionManager.ts
import Redis from 'ioredis';

type CircuitState = {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
};

type OperationType = 'get' | 'set' | 'del' | 'keys' | 'other';

/**
 * Singleton class to manage Redis connections across the application
 * with improved error handling and circuit breaking
 */
export class RedisConnectionManager {
  private static instance: RedisConnectionManager;
  private client: Redis | null = null;
  private isInitialized = false;

  // Circuit breaker states by operation type
  private operationCircuits = new Map<OperationType, CircuitState>();
  private globalCircuitOpen = false;
  private lastGlobalFailureTime = 0;

  // Configuration
  private readonly REDIS_TIMEOUT = 5000; // 5 seconds timeout (increased from 2s)
  private readonly MAX_FAILURES_PER_OPERATION = 3; // After 3 failures, disable specific operation
  private readonly MAX_GLOBAL_FAILURES = 10; // Open global circuit after 10 total failures
  private readonly CIRCUIT_RESET_TIME = 60000; // Try to use Redis again after 1 minute
  private readonly GLOBAL_CIRCUIT_RESET_TIME = 300000; // 5 minutes for global reset

  private constructor() {
    this.initialize().catch((err) => {
      console.error('Failed to initialize Redis connection:', err);
    });

    // Initialize circuit states
    const operations: OperationType[] = ['get', 'set', 'del', 'keys', 'other'];
    operations.forEach((op) => {
      this.operationCircuits.set(op, {
        failures: 0,
        lastFailureTime: 0,
        isOpen: false,
      });
    });

    // Set up automatic circuit reset checking
    setInterval(() => this.checkCircuitReset(), 30000);
  }

  /**
   * Checks if the Redis connection is working properly
   */
  async checkConnection(): Promise<{
    isConnected: boolean;
    pingLatency?: number;
    errorMessage?: string;
    lastConnectAttempt: Date;
    circuitStatus: {
      globalOpen: boolean;
      operationsDisabled: string[];
    };
  }> {
    const result = {
      isConnected: false,
      lastConnectAttempt: new Date(),
      circuitStatus: {
        globalOpen: this.globalCircuitOpen,
        operationsDisabled: Array.from(this.operationCircuits.entries())
          .filter(([_, state]) => state.isOpen)
          .map(([op]) => op),
      },
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
      await this.executeWithTimeout(
        () => this.client!.ping(),
        'other',
        3000, // Special timeout for ping
      );
      const pingLatency = performance.now() - startTime;

      return {
        isConnected: true,
        pingLatency,
        lastConnectAttempt: new Date(),
        circuitStatus: result.circuitStatus,
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
        maxRetriesPerRequest: 3,
        connectTimeout: 5000,
        commandTimeout: 5000,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 200, 1000);
        },
        enableReadyCheck: true,
        enableOfflineQueue: true, // Changed from false to true to avoid the "Stream isn't writeable" error
        reconnectOnError: (err) => {
          const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED'];
          return targetErrors.some((e) => err.message.includes(e));
        },
        lazyConnect: false, // Changed from true to false to ensure connection at startup
        family: 4,
        db: 0,
      });

      try {
        // Test connection with timeout
        await Promise.race([
          this.client.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 5000),
          ),
        ]);

        this.isInitialized = true;
        console.log('Redis connection successful:', {
          timestamp: new Date().toISOString(),
        });

        // Reset circuit breakers on successful connection
        this.resetCircuits();
      } catch (timeoutError) {
        console.error('Redis connection timeout:', timeoutError);
        throw timeoutError;
      }

      // Set up error event listener
      this.client.on('error', (err) => {
        console.error('Redis client error:', err);
        this.recordGlobalFailure();
      });
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
    return (
      this.isInitialized && this.client !== null && !this.globalCircuitOpen
    );
  }

  /**
   * Execute a Redis operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    operationType: OperationType = 'other',
    customTimeout?: number,
  ): Promise<T> {
    // Check global circuit first
    if (this.globalCircuitOpen) {
      throw new Error('Redis global circuit open');
    }

    // Check operation-specific circuit
    const circuitState = this.operationCircuits.get(operationType);
    if (circuitState && circuitState.isOpen) {
      throw new Error(`Redis ${operationType} circuit open`);
    }

    try {
      // Execute with timeout
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            const error = new Error(
              `Redis ${operationType} operation timed out`,
            );
            error.name = 'RedisTimeoutError';
            reject(error);
          }, customTimeout || this.REDIS_TIMEOUT),
        ),
      ]);
    } catch (error) {
      // Record failure and rethrow
      this.recordFailure(operationType);
      throw error;
    }
  }

  /**
   * Record a failure for specific operation type
   */
  private recordFailure(operationType: OperationType): void {
    const circuitState = this.operationCircuits.get(operationType);
    if (!circuitState) return;

    circuitState.failures++;
    circuitState.lastFailureTime = Date.now();

    if (circuitState.failures >= this.MAX_FAILURES_PER_OPERATION) {
      circuitState.isOpen = true;
      console.warn(
        `Redis ${operationType} circuit opened after ${circuitState.failures} failures`,
      );
    }

    // Also track global failures
    this.recordGlobalFailure();
  }

  /**
   * Record a global failure (regardless of operation type)
   */
  private recordGlobalFailure(): void {
    this.lastGlobalFailureTime = Date.now();

    // Count total recent failures across all operations
    const totalFailures = Array.from(this.operationCircuits.values()).reduce(
      (sum, state) => sum + state.failures,
      0,
    );

    if (totalFailures >= this.MAX_GLOBAL_FAILURES) {
      this.globalCircuitOpen = true;
      console.error(
        `Redis global circuit opened after ${totalFailures} total failures`,
      );
    }
  }

  /**
   * Check if circuits should be reset based on elapsed time
   */
  private checkCircuitReset(): void {
    const now = Date.now();

    // Check operation-specific circuits
    for (const [op, state] of this.operationCircuits.entries()) {
      if (
        state.isOpen &&
        now - state.lastFailureTime > this.CIRCUIT_RESET_TIME
      ) {
        state.isOpen = false;
        state.failures = 0;
        console.log(
          `Redis ${op} circuit reset after ${this.CIRCUIT_RESET_TIME}ms`,
        );
      }
    }

    // Check global circuit
    if (
      this.globalCircuitOpen &&
      now - this.lastGlobalFailureTime > this.GLOBAL_CIRCUIT_RESET_TIME
    ) {
      this.globalCircuitOpen = false;
      console.log(
        `Redis global circuit reset after ${this.GLOBAL_CIRCUIT_RESET_TIME}ms`,
      );
    }
  }

  /**
   * Reset all circuits on successful operation
   */
  private resetCircuits(): void {
    this.globalCircuitOpen = false;

    for (const state of this.operationCircuits.values()) {
      state.isOpen = false;
      state.failures = 0;
    }
  }

  /**
   * Safely execute a Redis operation with fallback value
   */
  async safeExecute<T>(
    operation: (redis: Redis) => Promise<T>,
    fallbackValue: T,
    operationType: OperationType = 'other',
  ): Promise<T> {
    if (!this.client || !this.isInitialized || this.globalCircuitOpen) {
      return fallbackValue;
    }

    try {
      return await this.executeWithTimeout(
        () => operation(this.client!),
        operationType,
      );
    } catch (error) {
      console.warn(`Redis ${operationType} operation failed:`, error);
      return fallbackValue;
    }
  }

  /**
   * Safely get a value from Redis with fallback
   */
  async safeGet(key: string): Promise<string | null> {
    return this.safeExecute((redis) => redis.get(key), null, 'get');
  }

  /**
   * Safely set a value in Redis, ignoring errors
   */
  async safeSet(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.client || !this.isInitialized || this.globalCircuitOpen) return;

    try {
      if (ttlSeconds) {
        await this.executeWithTimeout(
          () => this.client!.set(key, value, 'EX', ttlSeconds),
          'set',
        );
      } else {
        await this.executeWithTimeout(
          () => this.client!.set(key, value),
          'set',
        );
      }
    } catch (error) {
      console.warn('Redis set operation failed:', error);
      // Continue without failing
    }
  }

  /**
   * Safely delete a key from Redis, ignoring errors
   */
  async safeDel(key: string): Promise<void> {
    if (!this.client || !this.isInitialized || this.globalCircuitOpen) return;

    try {
      await this.executeWithTimeout(() => this.client!.del(key), 'del');
    } catch (error) {
      console.warn('Redis del operation failed:', error);
    }
  }

  /**
   * Safely find keys matching a pattern
   */
  async safeKeys(pattern: string): Promise<string[]> {
    return this.safeExecute((redis) => redis.keys(pattern), [], 'keys');
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

// utils/ServiceInitializationQueue.ts
import { InitializedServices } from '@/types/attendance';
import { initializeServices } from '@/services/ServiceInitializer';
import { AppError, ErrorCode } from '@/types/attendance/error';
import { PrismaClient } from '@prisma/client';

export class ServiceInitializationQueue {
  private static instance: ServiceInitializationQueue;
  private initializationPromise: Promise<InitializedServices> | null = null;
  private prisma: PrismaClient;
  private initialized: boolean = false;
  private initializationTime: number = 0;
  private lastError: Error | null = null;

  private constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  static getInstance(prisma?: PrismaClient): ServiceInitializationQueue {
    if (!this.instance) {
      if (!prisma) {
        throw new Error('PrismaClient required for first initialization');
      }
      this.instance = new ServiceInitializationQueue(prisma);
    }
    return this.instance;
  }

  async getInitializedServices(): Promise<InitializedServices> {
    if (!this.initializationPromise || !this.initialized) {
      console.log('Starting service initialization...');
      const startTime = Date.now();

      this.initializationPromise = initializeServices(this.prisma)
        .then((services) => {
          if (!services.attendanceService || !services.notificationService) {
            throw new AppError({
              code: ErrorCode.SERVICE_INITIALIZATION_ERROR,
              message: 'Required services are not initialized',
            });
          }

          const duration = Date.now() - startTime;
          console.log(`Services initialized successfully in ${duration}ms`);

          this.initialized = true;
          this.initializationTime = Date.now();
          this.lastError = null;

          return services;
        })
        .catch((error) => {
          this.lastError =
            error instanceof Error ? error : new Error(String(error));
          this.initialized = false;
          console.error('Service initialization failed:', error);
          throw error;
        });
    }

    return this.initializationPromise;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getInitializationStatus(): {
    initialized: boolean;
    initializationTime: number;
    lastError: Error | null;
  } {
    return {
      initialized: this.initialized,
      initializationTime: this.initializationTime,
      lastError: this.lastError,
    };
  }

  async reinitialize(): Promise<void> {
    this.initialized = false;
    this.initializationPromise = null;
    this.lastError = null;
    try {
      await this.getInitializedServices();
    } catch (error) {
      console.error('Service reinitialization failed:', error);
      throw error;
    }
  }

  // For health checks
  async healthCheck(): Promise<{
    status: 'ok' | 'error' | 'initializing';
    message?: string;
    uptime?: number;
  }> {
    if (this.initialized) {
      return {
        status: 'ok',
        uptime: Date.now() - this.initializationTime,
      };
    }

    if (this.lastError) {
      return {
        status: 'error',
        message: this.lastError.message,
      };
    }

    return {
      status: 'initializing',
    };
  }
}

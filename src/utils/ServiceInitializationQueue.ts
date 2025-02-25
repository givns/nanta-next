// utils/ServiceInitializationQueue.ts
import { InitializedServices } from '@/types/attendance';
import { initializeServices } from '@/services/ServiceInitializer';
import { AppError, ErrorCode } from '@/types/attendance/error';
import { PrismaClient } from '@prisma/client';

// Create private variables outside the class to avoid initialization order issues
let instanceRef: ServiceInitializationQueue | null = null;
let prismaRef: PrismaClient | null = null;

export class ServiceInitializationQueue {
  private initializationPromise: Promise<InitializedServices> | null = null;
  private prisma: PrismaClient;
  private initialized: boolean = false;
  private initializationTime: number = 0;
  private lastError: Error | null = null;

  private constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    console.log('ServiceInitializationQueue constructor called');
  }

  static getInstance(prisma?: PrismaClient): ServiceInitializationQueue {
    // Use the external variables instead of static class properties
    if (!instanceRef) {
      if (!prisma && !prismaRef) {
        throw new Error('PrismaClient required for first initialization');
      }

      // Store the prisma reference if provided
      if (prisma) {
        prismaRef = prisma;
      }

      console.log('Creating new ServiceInitializationQueue instance');
      instanceRef = new ServiceInitializationQueue(prismaRef!);
    }
    return instanceRef;
  }

  async getInitializedServices(): Promise<InitializedServices> {
    if (!this.initializationPromise || !this.initialized) {
      console.log('Starting service initialization...');
      const startTime = Date.now();

      // Create a new promise to prevent re-entrancy issues
      this.initializationPromise = new Promise<InitializedServices>(
        (resolve, reject) => {
          initializeServices(this.prisma)
            .then((services) => {
              if (
                !services.attendanceService ||
                !services.notificationService
              ) {
                const error = new AppError({
                  code: ErrorCode.SERVICE_INITIALIZATION_ERROR,
                  message: 'Required services are not initialized',
                });
                this.lastError = error;
                this.initialized = false;
                reject(error);
                return;
              }

              const duration = Date.now() - startTime;
              console.log(`Services initialized successfully in ${duration}ms`);

              this.initialized = true;
              this.initializationTime = Date.now();
              this.lastError = null;

              resolve(services);
            })
            .catch((error) => {
              this.lastError =
                error instanceof Error ? error : new Error(String(error));
              this.initialized = false;
              console.error('Service initialization failed:', error);
              reject(error);
            });
        },
      );
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

// Export a direct function to get the instance to avoid potential initialization issues
export function getServiceQueue(
  prisma?: PrismaClient,
): ServiceInitializationQueue {
  return ServiceInitializationQueue.getInstance(prisma);
}

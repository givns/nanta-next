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
  private services: InitializedServices | null = null;
  private prisma: PrismaClient;
  private initialized: boolean = false;
  private initializationTime: number = 0;
  private lastError: Error | null = null;
  private initializationAttempts: number = 0;
  private readonly MAX_INIT_ATTEMPTS = 3;
  private readonly INIT_TIMEOUT = 10000; // 10 seconds timeout

  private constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    console.log('ServiceInitializationQueue constructor called');
  }

  // In ServiceInitializationQueue.ts
  static getInstance(prisma?: PrismaClient): ServiceInitializationQueue {
    // If instance exists but is showing as not initialized, force it to initialized state
    if (
      instanceRef &&
      instanceRef.services &&
      Object.keys(instanceRef.services).length > 0
    ) {
      console.log('Found existing services - forcing initialized state');
      instanceRef.initialized = true;
      return instanceRef;
    }

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

  // Also update getInitializedServices to be more robust
  async getInitializedServices(): Promise<InitializedServices> {
    // Add extensive logging
    console.log(`Service initialization state detailed check:`, {
      initialized: this.initialized,
      hasServices: !!this.services,
      hasServicesKeys: this.services ? Object.keys(this.services).length : 0,
      hasPromise: !!this.initializationPromise,
    });

    // Return cached services if available - add more robust checking
    if (
      this.initialized &&
      this.services &&
      Object.keys(this.services).length > 0
    ) {
      console.log('Using cached service instances', {
        attendanceService: !!this.services.attendanceService,
        notificationService: !!this.services.notificationService,
      });
      return this.services;
    }

    // Check if initialization is already in progress
    if (this.initializationPromise) {
      try {
        return await this.initializationPromise;
      } catch (error) {
        // If previous init failed, we'll retry below
        this.initializationPromise = null;
        console.error('Previous service initialization failed:', error);
      }
    }

    console.log('Starting service initialization...');
    const startTime = Date.now();

    // Increment attempt counter
    this.initializationAttempts++;

    // Create a new promise with timeout
    this.initializationPromise = new Promise<InitializedServices>(
      async (resolve, reject) => {
        // Reject if we've exceeded maximum attempts
        if (this.initializationAttempts > this.MAX_INIT_ATTEMPTS) {
          const error = new AppError({
            code: ErrorCode.SERVICE_INITIALIZATION_ERROR,
            message: `Service initialization failed after ${this.MAX_INIT_ATTEMPTS} attempts`,
          });
          this.lastError = error;
          reject(error);
          return;
        }

        // Set a timeout for the entire initialization process
        const timeoutId = setTimeout(() => {
          const error = new AppError({
            code: ErrorCode.TIMEOUT,
            message: `Service initialization timed out after ${this.INIT_TIMEOUT}ms`,
          });
          this.lastError = error;
          reject(error);
        }, this.INIT_TIMEOUT);

        try {
          // Simply use the existing initializeServices function
          const services = await initializeServices(this.prisma);

          clearTimeout(timeoutId);

          if (!services.attendanceService || !services.notificationService) {
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

          // Cache the services
          this.services = services;
          this.initialized = true;
          this.initializationTime = Date.now();
          this.lastError = null;
          this.initializationAttempts = 0; // Reset counter on success

          resolve(services);
        } catch (error) {
          clearTimeout(timeoutId);
          this.lastError =
            error instanceof Error ? error : new Error(String(error));
          this.initialized = false;
          console.error('Service initialization failed:', error);
          reject(error);
        }
      },
    );

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null; // Clear promise on error
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized && this.services !== null;
  }

  getInitializationStatus(): {
    initialized: boolean;
    initializationTime: number;
    lastError: Error | null;
    attempts: number;
  } {
    return {
      initialized: this.initialized,
      initializationTime: this.initializationTime,
      lastError: this.lastError,
      attempts: this.initializationAttempts,
    };
  }

  async reinitialize(): Promise<void> {
    this.initialized = false;
    this.services = null;
    this.initializationPromise = null;
    this.lastError = null;
    this.initializationAttempts = 0;

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
    attempts?: number;
  }> {
    if (this.initialized && this.services) {
      return {
        status: 'ok',
        uptime: Date.now() - this.initializationTime,
      };
    }

    if (this.lastError) {
      return {
        status: 'error',
        message: this.lastError.message,
        attempts: this.initializationAttempts,
      };
    }

    return {
      status: 'initializing',
      attempts: this.initializationAttempts,
    };
  }
}

export function getServiceQueue(
  prisma?: PrismaClient,
): ServiceInitializationQueue {
  if (instanceRef) {
    console.log('Returning existing ServiceInitializationQueue instance');
  }
  return ServiceInitializationQueue.getInstance(prisma);
}

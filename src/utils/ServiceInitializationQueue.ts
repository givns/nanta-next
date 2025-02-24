// Create new file: utils/ServiceInitializationQueue.ts
import { InitializedServices } from '@/types/attendance';
import { initializeServices } from '@/services/ServiceInitializer';
import { AppError, ErrorCode } from '@/types/attendance/error';
import { PrismaClient } from '@prisma/client';

export class ServiceInitializationQueue {
  private static instance: ServiceInitializationQueue;
  private initializationPromise: Promise<InitializedServices> | null = null;
  private prisma: PrismaClient;

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
    if (!this.initializationPromise) {
      this.initializationPromise = initializeServices(this.prisma).then(
        (services) => {
          if (!services.attendanceService || !services.notificationService) {
            throw new AppError({
              code: ErrorCode.SERVICE_INITIALIZATION_ERROR,
              message: 'Required services are not initialized',
            });
          }
          return services;
        },
      );
    }
    return this.initializationPromise;
  }

  async resetInitialization(): Promise<void> {
    this.initializationPromise = null;
  }
}

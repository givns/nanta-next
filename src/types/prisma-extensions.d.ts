import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

declare module '@prisma/client' {
  interface PrismaClient {
    calculateTotalDistance(sessionId: string): Promise<number>;
  }
}

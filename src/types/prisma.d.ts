// types/prisma.d.ts
import { PrismaClient } from '@prisma/client';

declare module '@prisma/client' {
  interface PrismaClient {
    $on: (eventType: string, callback: (event: any) => void) => void;
  }
}

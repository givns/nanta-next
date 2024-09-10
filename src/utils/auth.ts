// utils/auth.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getUserRole(lineUserId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { lineUserId } });
  return user?.role || null;
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getUserRole(lineUserId: string): Promise<string | null> {
  console.log('Getting user role for lineUserId:', lineUserId);
  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId: lineUserId },
      select: { role: true },
    });
    console.log('Found user:', user);
    return user?.role || null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

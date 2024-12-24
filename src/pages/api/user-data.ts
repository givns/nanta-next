import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { cacheService } from '@/services/cache/CacheService';
import { UserRole } from '@/types/enum';
import { z } from 'zod';

const prisma = new PrismaClient();

// Define the schema here directly instead of importing from elsewhere
const UserDataSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  lineUserId: z.string().nullable(),
  nickname: z.string().nullable(),
  departmentName: z.string(),
  shiftCode: z.string().nullable(),
  employeeType: z.string(),
  role: z.nativeEnum(UserRole),
  profilePictureUrl: z.string().nullable(),
  shiftId: z.string().nullable(),
  sickLeaveBalance: z.number(),
  businessLeaveBalance: z.number(),
  annualLeaveBalance: z.number(),
  updatedAt: z.date().optional(),
});

type UserData = z.infer<typeof UserDataSchema>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'] as string;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    const cacheKey = `user:${lineUserId}`;
    let userData: UserData | null = null;

    // Try to get from cache
    if (cacheService) {
      const cachedData = await cacheService.get(cacheKey);
      if (cachedData) {
        try {
          const parsedData = JSON.parse(cachedData);
          userData = UserDataSchema.parse(parsedData); // Direct use of schema
        } catch (parseError) {
          console.error('Error parsing cached data:', parseError);
          // Invalidate corrupted cache
          await cacheService.del(cacheKey);
        }
      }
    }

    // If not in cache or cache parsing failed, get from database
    if (!userData) {
      const user = await prisma.user.findUnique({
        where: { lineUserId },
        include: { department: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Validate user data against schema
      userData = UserDataSchema.parse(user); // Direct use of schema

      // Cache the validated data
      if (cacheService) {
        await cacheService.set(cacheKey, JSON.stringify(userData), 3600); // Cache for 1 hour
      }
    }

    console.log('User data:', userData);
    return res.status(200).json({ user: userData });
  } catch (error) {
    console.error('Error fetching user data:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid user data format',
        details: error.errors,
      });
    }
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    await prisma.$disconnect();
  }
}

import { LeaveRequest, OvertimeRequest, User, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { UserRole } from '@/types/enum';

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export class UseMappingService {
  constructor() {
    console.log('UseMappingService constructor called');
    if (!prisma) {
      console.error('Prisma client is not initialized');
    }
  }

  async getLineUserId(employeeId: string): Promise<string | null> {
    console.log(`Fetching LINE User ID for employee: ${employeeId}`);
    try {
      console.log('Before Prisma query');
      console.log('Prisma client is', prisma ? 'defined' : 'undefined');

      const isConnected = await this.checkDatabaseConnection();
      if (!isConnected) {
        console.error('Cannot fetch LINE User ID: Database connection failed');
        return null;
      }

      const startTime = Date.now();
      const userPromise = prisma.user.findUnique({
        where: { employeeId },
        select: { lineUserId: true },
      });

      console.log('Prisma query initiated, waiting for result or timeout');

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          console.log('Timeout reached');
          reject(new Error('Prisma query timed out'));
        }, 30000);
      });
      console.log('Timeout promise defined');

      console.log('About to await Promise.race');
      const user = (await Promise.race([userPromise, timeoutPromise])) as {
        lineUserId: string | null;
      } | null;
      console.log('Promise.race completed');

      const endTime = Date.now();
      console.log(`Prisma query took ${endTime - startTime}ms`);

      console.log('After Prisma query', user);

      if (!user) {
        console.warn(`No user found for employeeId: ${employeeId}`);
        return null;
      }
      console.log(`Retrieved LINE User ID:`, user.lineUserId);
      return user.lineUserId;
    } catch (error) {
      console.error(
        `Error fetching LINE User ID for employee ${employeeId}:`,
        error,
      );
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error('Prisma error code:', error.code);
        console.error('Prisma error message:', error.message);
        console.error('Prisma error meta:', error.meta);
      }
      return null;
    }
  }

  async checkDatabaseConnection(): Promise<boolean> {
    try {
      await prisma.$connect();
      console.log('Database connection successful');
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    } finally {
      await prisma.$disconnect();
    }
  }

  async getUserByEmployeeId(employeeId: string): Promise<User | null> {
    console.log(`Getting user by employeeId: ${employeeId}`);
    try {
      const user = await prisma.user.findUnique({ where: { employeeId } });
      console.log(`User found:`, user ? 'Yes' : 'No');
      return user;
    } catch (error) {
      console.error(`Error getting user by employeeId ${employeeId}:`, error);
      return null;
    }
  }

  async getAdminUsers(): Promise<User[]> {
    console.log('Getting admin users');
    try {
      const users = await prisma.user.findMany({
        where: {
          role: {
            in: [UserRole.ADMIN, UserRole.SUPERADMIN],
          },
        },
      });
      console.log(`Found ${users.length} admin users`);
      return users;
    } catch (error) {
      console.error('Error getting admin users:', error);
      return [];
    }
  }

  async getRequestById<T extends 'leave' | 'overtime'>(
    requestId: string,
    requestType: T,
  ): Promise<T extends 'leave' ? LeaveRequest | null : OvertimeRequest | null> {
    console.log(`Getting ${requestType} request by id: ${requestId}`);
    try {
      if (requestType === 'leave') {
        return prisma.leaveRequest.findUnique({
          where: { id: requestId },
        }) as any;
      } else {
        return prisma.overtimeRequest.findUnique({
          where: { id: requestId },
        }) as any;
      }
    } catch (error) {
      console.error(
        `Error getting ${requestType} request by id ${requestId}:`,
        error,
      );
      return null;
    }
  }

  async getRequestCountForAllAdmins(): Promise<number> {
    console.log('Getting request count for all admins');
    try {
      const now = new Date();
      const currentMonthStart =
        now.getDate() < 26
          ? new Date(now.getFullYear(), now.getMonth() - 1, 26)
          : new Date(now.getFullYear(), now.getMonth(), 26);

      const [leaveRequests, overtimeRequests] = await Promise.all([
        prisma.leaveRequest.count({
          where: {
            createdAt: { gte: currentMonthStart },
            status: 'PENDING',
          },
        }),
        prisma.overtimeRequest.count({
          where: {
            createdAt: { gte: currentMonthStart },
            status: 'PENDING',
          },
        }),
      ]);

      const totalCount = leaveRequests + overtimeRequests;
      console.log(`Total pending requests: ${totalCount}`);
      return totalCount;
    } catch (error) {
      console.error('Error getting request count for all admins:', error);
      return 0;
    }
  }
}

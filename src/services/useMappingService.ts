import { LeaveRequest, OvertimeRequest, User } from '@prisma/client';
import prisma from '../lib/prisma';
import { UserRole } from '@/types/enum';

export class UseMappingService {
  constructor() {}

  async getLineUserId(employeeId: string): Promise<string | null> {
    console.log(`Fetching LINE User ID for employee: ${employeeId}`);
    try {
      console.log('Before Prisma query');
      console.log('Prisma client is', prisma ? 'defined' : 'undefined');

      const user = await prisma.user.findFirst({
        where: { employeeId },
        select: { lineUserId: true },
      });
      console.log('After Prisma query', user);

      if (!user) {
        console.warn(`No user found for employeeId: ${employeeId}`);
        return null;
      }
      return user.lineUserId;
    } catch (error) {
      console.error(
        `Error fetching LINE User ID for employee ${employeeId}:`,
        error,
      );
      return null;
    }
  }

  async getUserByEmployeeId(employeeId: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { employeeId } });
  }

  async getAdminUsers(): Promise<User[]> {
    return prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN, UserRole.SUPERADMIN],
        },
      },
    });
  }

  async getRequestById<T extends 'leave' | 'overtime'>(
    requestId: string,
    requestType: T,
  ): Promise<T extends 'leave' ? LeaveRequest | null : OvertimeRequest | null> {
    if (requestType === 'leave') {
      return prisma.leaveRequest.findUnique({
        where: { id: requestId },
      }) as any;
    } else {
      return prisma.overtimeRequest.findUnique({
        where: { id: requestId },
      }) as any;
    }
  }

  async getRequestCountForAllAdmins(): Promise<number> {
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

    return leaveRequests + overtimeRequests;
  }
}

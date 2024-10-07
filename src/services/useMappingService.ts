import {
  LeaveRequest,
  OvertimeRequest,
  PrismaClient,
  Prisma,
  User,
} from '@prisma/client';
import { UserRole } from '@/types/enum';

export class UseMappingService {
  constructor(private prisma: PrismaClient) {}

  async getLineUserId(employeeId: string): Promise<string | null> {
    console.log(`Fetching LINE User ID for employee: ${employeeId}`);
    try {
      const user = (await Promise.race([
        this.prisma.user.findUnique({
          where: { employeeId },
          select: { lineUserId: true },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database query timed out')), 5000),
        ),
      ])) as { lineUserId: string | null } | null;

      console.log(`User data fetched:`, user);
      if (!user) {
        console.warn(`No user found for employeeId: ${employeeId}`);
        return null;
      }
      if (!user.lineUserId) {
        console.warn(`No LINE User ID found for employeeId: ${employeeId}`);
      }
      return user.lineUserId;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(`Database error for employee ${employeeId}:`, error);
      } else {
        console.error(
          `Error fetching LINE User ID for employee ${employeeId}:`,
          error,
        );
      }
      return null;
    }
  }

  async getUserByEmployeeId(employeeId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { employeeId } });
  }

  async getAdminUsers(): Promise<User[]> {
    return this.prisma.user.findMany({
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
      return this.prisma.leaveRequest.findUnique({
        where: { id: requestId },
      }) as any;
    } else {
      return this.prisma.overtimeRequest.findUnique({
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
      this.prisma.leaveRequest.count({
        where: {
          createdAt: { gte: currentMonthStart },
          status: 'PENDING',
        },
      }),
      this.prisma.overtimeRequest.count({
        where: {
          createdAt: { gte: currentMonthStart },
          status: 'PENDING',
        },
      }),
    ]);

    return leaveRequests + overtimeRequests;
  }
}

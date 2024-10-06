import {
  LeaveRequest,
  OvertimeRequest,
  PrismaClient,
  User,
} from '@prisma/client';
import { UserRole } from '@/types/enum';

export class UserMappingService {
  constructor(private prisma: PrismaClient) {}

  async getLineUserId(employeeId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      select: { lineUserId: true },
    });
    return user?.lineUserId || null;
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

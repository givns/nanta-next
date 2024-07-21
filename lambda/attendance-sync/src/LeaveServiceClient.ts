// services/LeaveServiceClient.ts

import { PrismaClient, LeaveRequest } from '@prisma/client';
import { ILeaveServiceClient } from '@/types/LeaveService';

const prisma = new PrismaClient();

export class LeaveServiceClient implements ILeaveServiceClient {
  async createLeaveRequest(
    lineUserId: string,
    leaveType: string,
    leaveFormat: string,
    reason: string,
    startDate: string,
    endDate: string,
    fullDayCount: number,
    useOvertimeHours: boolean,
    resubmitted: boolean = false,
    originalRequestId?: string,
  ): Promise<LeaveRequest> {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) throw new Error('User not found');

    let leaveRequestData: any = {
      userId: user.id,
      leaveType,
      leaveFormat,
      reason,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'Pending',
      fullDayCount,
      useOvertimeHours,
      resubmitted,
    };

    if (resubmitted && originalRequestId) {
      const originalRequest =
        await this.getOriginalLeaveRequest(originalRequestId);
      leaveRequestData = {
        ...originalRequest,
        ...leaveRequestData,
        originalRequestId,
        id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      };
    }

    const newLeaveRequest = await prisma.leaveRequest.create({
      data: leaveRequestData,
    });

    await this.notifyAdmins(newLeaveRequest);

    return newLeaveRequest;
  }

  async checkLeaveBalance(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { leaveRequests: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const usedLeave = user.leaveRequests
      .filter((request) => request.status === 'Approved')
      .reduce((total, request) => total + request.fullDayCount, 0);

    const totalLeaveDays = 6;
    return totalLeaveDays - usedLeave;
  }

  async getLeaveRequests(userId: string): Promise<LeaveRequest[]> {
    return prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    return prisma.leaveRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  async getOriginalLeaveRequest(requestId: string): Promise<LeaveRequest> {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!leaveRequest) {
      throw new Error('Original leave request not found');
    }

    return leaveRequest;
  }

  private async notifyAdmins(leaveRequest: LeaveRequest): Promise<void> {
    // Notify admins
  }
}

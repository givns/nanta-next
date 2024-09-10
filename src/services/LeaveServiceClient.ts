// services/LeaveServiceClient.ts

import { PrismaClient, LeaveRequest } from '@prisma/client';
import { ILeaveServiceClient } from '@/types/LeaveService';

const prisma = new PrismaClient();

interface LeaveBalanceData {
  sickLeave: number;
  businessLeave: number;
  annualLeave: number;
  totalLeaveDays: number;
}

export class LeaveServiceClient implements ILeaveServiceClient {
  async createLeaveRequest(
    lineUserId: string,
    leaveType: string,
    leaveFormat: string,
    reason: string,
    startDate: string,
    endDate: string,
    fullDayCount: number,
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

  async checkLeaveBalance(userId: string): Promise<LeaveBalanceData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { leaveRequests: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const approvedRequests = user.leaveRequests.filter(
      (request) => request.status === 'Approved',
    );

    const usedLeave = {
      sickLeave: 0,
      businessLeave: 0,
      annualLeave: 0,
    };

    approvedRequests.forEach((request) => {
      switch (request.leaveType) {
        case 'ลาป่วย':
          usedLeave.sickLeave += request.fullDayCount;
          break;
        case 'ลากิจ':
          usedLeave.businessLeave += request.fullDayCount;
          break;
        case 'ลาพักร้อน':
          usedLeave.annualLeave += request.fullDayCount;
          break;
      }
    });

    const balance = {
      sickLeave: user.sickLeaveBalance - usedLeave.sickLeave,
      businessLeave: user.businessLeaveBalance - usedLeave.businessLeave,
      annualLeave: user.annualLeaveBalance - usedLeave.annualLeave,
      totalLeaveDays: 0,
    };

    balance.totalLeaveDays =
      balance.sickLeave + balance.businessLeave + balance.annualLeave;

    return balance;
  }

  async getLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
    return prisma.leaveRequest.findMany({
      where: { employeeId },
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

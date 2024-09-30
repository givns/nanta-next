// services/LeaveServiceServer.ts

import { PrismaClient, Prisma, LeaveRequest, User } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import {
  sendApproveNotification,
  sendDenyNotification,
} from '../utils/sendNotifications';
import { sendRequestNotification } from '../utils/sendRequestNotification';
import { UserRole } from '../types/enum';
import { ILeaveServiceServer, LeaveBalanceData } from '@/types/LeaveService';
import { NotificationService } from './NotificationService';
import { cacheService } from './CacheService';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export class LeaveServiceServer implements ILeaveServiceServer {
  private prisma: PrismaClient;
  private notificationService: NotificationService;

  constructor() {
    this.prisma = new PrismaClient();
    this.notificationService = new NotificationService();
  }

  private async invalidateUserCache(employeeId: string) {
    if (!cacheService) {
      console.warn(
        'Cache service is not available. Skipping cache invalidation.',
      );
      return;
    }

    try {
      // 1. Invalidate user-specific cache
      await cacheService.invalidatePattern(`user:${employeeId}*`);

      // 2. Invalidate attendance-related cache
      await cacheService.invalidatePattern(`attendance:${employeeId}*`);

      // 3. Invalidate leave request cache
      await cacheService.invalidatePattern(`leaveRequest:${employeeId}*`);

      // 4. Invalidate any other user-specific cache patterns
      // For example, if you have overtime request caches:
      await cacheService.invalidatePattern(`overtimeRequest:${employeeId}*`);

      // 5. Invalidate any list caches that might include this user's data
      await cacheService.invalidatePattern('userList*');
      await cacheService.invalidatePattern('leaveRequestList*');

      console.log(`Cache invalidated for employee ${employeeId}`);
    } catch (error) {
      console.error(
        `Error invalidating cache for employee ${employeeId}:`,
        error,
      );
    }
  }

  async checkLeaveBalance(employeeId: string): Promise<LeaveBalanceData> {
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { leaveRequests: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return this.calculateLeaveBalance(user);
  }

  private calculateLeaveBalance(
    user: User & { leaveRequests: LeaveRequest[] },
  ): LeaveBalanceData {
    const approvedRequests = user.leaveRequests.filter(
      (request) => request.status === 'Approved',
    );

    const usedLeave = {
      sickLeave: 0,
      businessLeave: 0,
      annualLeave: 0,
      overtimeLeave: 0,
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
        case 'ลาโดยใช้ชั่วโมง OT':
          usedLeave.overtimeLeave += request.fullDayCount;
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

  async checkUserOnLeave(
    userId: string,
    date: Date,
  ): Promise<LeaveRequest | null> {
    const leaveRequest = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: userId,
        status: { in: ['Approved', 'Pending'] },
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });

    return leaveRequest;
  }

  async hasPendingLeaveRequest(
    employeeId: string,
    date: Date,
  ): Promise<boolean> {
    const pendingLeaveRequest = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: 'Pending',
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });

    return !!pendingLeaveRequest;
  }

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
    const user = await this.prisma.user.findUnique({
      where: { lineUserId },
    });
    if (!user) throw new Error(`User not found for lineUserId: ${lineUserId}`);

    const leaveBalance = await this.checkLeaveBalance(user.employeeId);

    // Check if user has enough leave balance
    let availableDays: number;
    switch (leaveType) {
      case 'ลาป่วย':
        availableDays = leaveBalance.sickLeave;
        break;
      case 'ลากิจ':
        availableDays = leaveBalance.businessLeave;
        break;
      case 'ลาพักร้อน':
        availableDays = leaveBalance.annualLeave;
        break;
      default:
        throw new Error(`Invalid leave type: ${leaveType}`);
    }

    if (fullDayCount > availableDays) {
      throw new Error(
        `ไม่มีวันลา${leaveType}เพียงพอ (ขอลา ${fullDayCount} วัน, เหลือ ${availableDays} วัน)`,
      );
    }

    let leaveRequestData: Prisma.LeaveRequestCreateInput = {
      user: { connect: { employeeId: user.employeeId } },
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
      leaveRequestData.originalRequestId = originalRequestId;
    }

    try {
      const newLeaveRequest = await this.prisma.leaveRequest.create({
        data: leaveRequestData,
      });

      await this.notifyAdmins(newLeaveRequest);

      return newLeaveRequest;
    } catch (error) {
      console.error('Error creating leave request:', error);
      throw new Error('Failed to create leave request. Please try again.');
    }
  }

  async approveLeaveRequest(
    requestId: string,
    lineUserId: string,
  ): Promise<LeaveRequest> {
    const leaveRequest = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Approved', approverId: lineUserId },
      include: { user: true },
    });
    await this.invalidateUserCache(leaveRequest.employeeId);

    const admin = await this.prisma.user.findUnique({ where: { lineUserId } });

    if (leaveRequest.user && admin) {
      await sendApproveNotification(
        leaveRequest.user,
        leaveRequest,
        admin,
        'leave',
      );
    }

    return leaveRequest;
  }

  async initiateDenial(
    requestId: string,
    lineUserId: string,
  ): Promise<LeaveRequest> {
    const leaveRequest = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'DenialPending', approverId: lineUserId },
      include: { user: true },
    });

    const admin = await this.prisma.user.findUnique({ where: { lineUserId } });

    if (admin) {
      const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/deny-reason?requestId=${requestId}&approverId=${lineUserId}`;
      await client.pushMessage(lineUserId, {
        type: 'text',
        text: `กรุณาระบุเหตุผลในการไม่อนุมัติคำขอลา: ${liffUrl}`,
      });
    }

    return leaveRequest;
  }

  async finalizeDenial(
    requestId: string,
    lineUserId: string,
    denialReason: string,
  ): Promise<LeaveRequest> {
    const leaveRequest = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Denied', denialReason },
      include: { user: true },
    });
    await this.invalidateUserCache(leaveRequest.employeeId);

    const admin = await this.prisma.user.findUnique({ where: { lineUserId } });

    if (leaveRequest.user && admin) {
      await sendDenyNotification(
        leaveRequest.user,
        leaveRequest,
        admin,
        denialReason,
        'leave',
      );
    }

    return leaveRequest;
  }

  async getOriginalLeaveRequest(requestId: string): Promise<LeaveRequest> {
    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!leaveRequest) {
      throw new Error('Original leave request not found');
    }

    return leaveRequest;
  }

  async getLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
    return this.prisma.leaveRequest.findMany({
      where: { employeeId: employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    return this.prisma.leaveRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  private async notifyAdmins(leaveRequest: LeaveRequest): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN.toString(), UserRole.SUPERADMIN.toString()],
        },
      },
    });

    for (const admin of admins) {
      await sendRequestNotification(admin, leaveRequest, 'leave');
    }
  }

  async getLeaveRequestForDate(
    userId: string,
    date: Date,
  ): Promise<LeaveRequest | null> {
    return this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: userId,
        startDate: { lte: date },
        endDate: { gte: date },
        status: 'Approved',
      },
    });
  }

  async cancelApprovedLeave(requestId: string): Promise<LeaveRequest> {
    const cancelledLeave = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Cancelled' },
      include: { user: true },
    });

    if (cancelledLeave.user.lineUserId) {
      await this.notificationService.sendNotification(
        cancelledLeave.user.id,
        `Your approved leave from ${cancelledLeave.startDate} to ${cancelledLeave.endDate} has been cancelled.`,
        cancelledLeave.user.lineUserId,
      );
    }

    return cancelledLeave;
  }
}

export const leaveServiceServer = new LeaveServiceServer();

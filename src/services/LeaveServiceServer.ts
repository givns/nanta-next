// services/LeaveServiceServer.ts

import { PrismaClient, LeaveRequest } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import {
  sendApproveNotification,
  sendDenyNotification,
} from '../utils/sendNotifications';
import { sendLeaveRequestNotification } from '../utils/sendLeaveRequestNotification';
import { UserRole } from '@/types/enum';
import { ILeaveService } from '@/types/LeaveService';

const prisma = new PrismaClient();
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export class LeaveServiceServer implements ILeaveService {
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

  async approveLeaveRequest(
    requestId: string,
    lineUserId: string,
  ): Promise<LeaveRequest> {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Approved', approverId: lineUserId },
      include: { user: true },
    });

    const admin = await prisma.user.findUnique({ where: { lineUserId } });

    if (leaveRequest.user && admin) {
      await sendApproveNotification(leaveRequest.user, leaveRequest, admin);
    }

    return leaveRequest;
  }

  async initiateDenial(
    requestId: string,
    lineUserId: string,
  ): Promise<LeaveRequest> {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'DenialPending', approverId: lineUserId },
      include: { user: true },
    });

    const admin = await prisma.user.findUnique({ where: { lineUserId } });

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
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Denied', denialReason },
      include: { user: true },
    });

    const admin = await prisma.user.findUnique({ where: { lineUserId } });

    if (leaveRequest.user && admin) {
      await sendDenyNotification(
        leaveRequest.user,
        leaveRequest,
        admin,
        denialReason,
      );
    }

    return leaveRequest;
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

  private async notifyAdmins(leaveRequest: LeaveRequest): Promise<void> {
    const admins = await prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN.toString(), UserRole.SUPERADMIN.toString()],
        },
      },
    });

    for (const admin of admins) {
      await sendLeaveRequestNotification(admin, leaveRequest);
    }
  }
}

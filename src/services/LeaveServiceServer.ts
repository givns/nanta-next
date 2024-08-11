// services/LeaveServiceServer.ts

import { PrismaClient, LeaveRequest, User } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import {
  sendApproveNotification,
  sendDenyNotification,
} from '../utils/sendNotifications';
import { sendRequestNotification } from '../utils/sendRequestNotification';
import { UserRole } from '../types/enum';
import { ILeaveServiceServer, LeaveBalanceData } from '@/types/LeaveService';

const prisma = new PrismaClient();
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export class LeaveServiceServer implements ILeaveServiceServer {
  async checkLeaveBalance(userId: string): Promise<LeaveBalanceData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      overtimeLeave: user.overtimeLeaveBalance - usedLeave.overtimeLeave,
      totalLeaveDays: 0,
    };

    balance.totalLeaveDays =
      balance.sickLeave +
      balance.businessLeave +
      balance.annualLeave +
      balance.overtimeLeave;

    return balance;
  }

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
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: { leaveRequests: true },
    });
    if (!user) throw new Error('User not found');

    const leaveBalance = this.calculateLeaveBalance(user);

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
      case 'ลาโดยใช้ชั่วโมง OT':
        availableDays = leaveBalance.overtimeLeave;
        break;
      default:
        throw new Error('Invalid leave type');
    }

    if (fullDayCount > availableDays) {
      throw new Error(`ไม่มีวันลา${leaveType}เพียงพอ`);
    }

    let leaveRequestData: any = {
      employeeId: user.employeeId,
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
        'leave',
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

  async getLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
    return prisma.leaveRequest.findMany({
      where: { employeeId: employeeId },
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
      await sendRequestNotification(admin, leaveRequest, 'leave');
    }
  }
}
export const leaveServiceServer = new LeaveServiceServer();

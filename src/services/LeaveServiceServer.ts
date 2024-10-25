// services/LeaveServiceServer.ts

import { PrismaClient, Prisma, LeaveRequest, User } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import { UserRole } from '../types/enum';
import { ILeaveServiceServer, LeaveBalanceData } from '@/types/LeaveService';
import { NotificationService } from './NotificationService';
import { cacheService } from './CacheService';
import { RequestService } from './RequestService';
import { addDays } from 'date-fns';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class LeaveServiceServer
  extends RequestService
  implements ILeaveServiceServer
{
  protected getRequestModel() {
    return this.prisma.leaveRequest;
  }

  protected getRequestType() {
    return 'leave' as const;
  }

  private async invalidateUserCache(employeeId: string): Promise<boolean> {
    if (!cacheService) {
      console.warn(
        'Cache service is not available. Skipping cache invalidation.',
      );
      return false;
    }

    try {
      await Promise.all([
        cacheService.invalidatePattern(`user:${employeeId}*`),
        cacheService.invalidatePattern(`attendance:${employeeId}*`),
        cacheService.invalidatePattern(`leaveRequest:${employeeId}*`),
        cacheService.invalidatePattern(`overtimeRequest:${employeeId}*`),
        cacheService.invalidatePattern('userList*'),
        cacheService.invalidatePattern('leaveRequestList*'),
      ]);

      console.log(`Cache invalidated for employee ${employeeId}`);
      return true;
    } catch (error) {
      console.error(
        `Error invalidating cache for employee ${employeeId}:`,
        error,
      );
      return false;
    }
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
        include: { user: true },
      });

      await this.notifyAdmins(newLeaveRequest);

      // Update Attendance record if leave is approved
      if (newLeaveRequest.status === 'approved') {
        await this.prisma.$transaction(async (tx) => {
          await this.updateAttendanceForLeave(newLeaveRequest, tx);
        });
      }

      return newLeaveRequest;
    } catch (error) {
      console.error('Error creating leave request:', error);
      throw new Error('Failed to create leave request. Please try again.');
    }
  }

  private async notifyAdmins(
    leaveRequest: LeaveRequest & { user: User },
  ): Promise<void> {
    console.log(`Notifying admins for leave request: ${leaveRequest.id}`);
    const admins = await this.prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN.toString(), UserRole.SUPERADMIN.toString()],
        },
      },
      select: {
        employeeId: true,
        lineUserId: true,
      },
    });
    console.log(`Found ${admins.length} admins to notify`);

    for (const admin of admins) {
      console.log(`Sending notification to admin: ${admin.employeeId}`);
      try {
        if (admin.lineUserId) {
          await this.notificationService.sendRequestNotification(
            admin.employeeId,
            admin.lineUserId,
            leaveRequest.id,
            'leave',
            leaveRequest.user,
            leaveRequest,
          );
          console.log(
            `Notification queued successfully for admin: ${admin.employeeId}`,
          );
        } else {
          console.warn(`Admin ${admin.employeeId} does not have a lineUserId`);
        }
      } catch (error) {
        console.error(
          `Failed to queue notification for admin ${admin.employeeId}:`,
          error,
        );
      }
    }
  }

  private async updateAttendanceForLeave(
    leaveRequest: LeaveRequest,
    tx: TransactionClient,
  ) {
    const { startDate, endDate, employeeId } = leaveRequest;
    let currentDate = startDate;

    while (currentDate <= endDate) {
      await tx.attendance.upsert({
        where: {
          id: `${employeeId}-${currentDate}`,
        },
        update: {
          isDayOff: true,
          status: 'off',
        },
        create: {
          employeeId,
          date: currentDate,
          isDayOff: true,
          status: 'off',
        },
      });
      currentDate = addDays(currentDate, 1);
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
    employeeId: string,
    date: Date,
  ): Promise<LeaveRequest | null> {
    const leaveRequest = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
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

  async approveLeaveRequest(
    requestId: string,
    approverEmployeeId: string,
  ): Promise<LeaveRequest> {
    return await this.prisma.$transaction(async (tx) => {
      const leaveRequest = await this.getRequestModel().findUnique({
        where: { id: requestId },
        include: { user: true },
      });

      if (!leaveRequest) {
        throw new Error('Leave request not found');
      }

      await this.updateLeaveBalance(leaveRequest, tx);

      const approvedRequest = (await super.approveRequest(
        requestId,
        approverEmployeeId,
        tx,
      )) as LeaveRequest;

      await this.updateAttendanceForLeave(approvedRequest, tx);
      await this.invalidateUserCache(approvedRequest.employeeId);

      return approvedRequest;
    });
  }

  private async updateLeaveBalance(
    leaveRequest: LeaveRequest & { user: User },
    tx: TransactionClient,
  ) {
    let updateField:
      | 'sickLeaveBalance'
      | 'businessLeaveBalance'
      | 'annualLeaveBalance';

    switch (leaveRequest.leaveType) {
      case 'ลาป่วย':
        updateField = 'sickLeaveBalance';
        break;
      case 'ลากิจ':
        updateField = 'businessLeaveBalance';
        break;
      case 'ลาพักร้อน':
        updateField = 'annualLeaveBalance';
        break;
      default:
        throw new Error(`Invalid leave type: ${leaveRequest.leaveType}`);
    }

    const currentBalance = leaveRequest.user[updateField];
    const newBalance = currentBalance - leaveRequest.fullDayCount;

    if (newBalance < 0) {
      throw new Error(`Insufficient ${updateField} balance`);
    }

    await tx.user.update({
      where: { id: leaveRequest.user.id },
      data: {
        [updateField]: newBalance,
      },
    });
  }

  async denyLeaveRequest(
    requestId: string,
    denierEmployeeId: string,
  ): Promise<LeaveRequest> {
    const deniedRequest = (await super.denyRequest(
      requestId,
      denierEmployeeId,
    )) as LeaveRequest;
    await this.invalidateUserCache(deniedRequest.employeeId);
    return deniedRequest;
  }

  async createResubmittedRequest(
    originalRequestId: string,
    updatedData: Partial<LeaveRequest>,
  ): Promise<LeaveRequest> {
    try {
      const originalRequest = await this.getOriginalRequest(originalRequestId);
      console.log('originalRequest', originalRequest);
      const newRequest = await this.prisma.leaveRequest.update({
        where: { id: originalRequestId },
        data: {
          ...updatedData,
          status: 'Pending',
          resubmitted: true,
          originalRequestId,
        },
        include: { user: true },
      });

      await this.invalidateUserCache(newRequest.employeeId);

      await this.notifyAdmins(newRequest);

      return newRequest;
    } catch (error: any) {
      console.error('Error creating resubmitted leave request:', error.message);
      throw error;
    }
  }

  async getOriginalRequest(requestId: string): Promise<LeaveRequest> {
    return super.getOriginalRequest(requestId) as Promise<LeaveRequest>;
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

  async getLeaveRequestForDate(
    employeeId: string,
    date: Date,
  ): Promise<LeaveRequest | null> {
    return this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: employeeId,
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
      const message = `การลาที่ได้รับการอนุมัติในวันที่ ${cancelledLeave.startDate.toLocaleDateString()} ถึง ${cancelledLeave.endDate.toLocaleDateString()} ได้ถูกยกเลิกเรียบร้อยแล้ว`;

      await this.notificationService.sendNotification(
        cancelledLeave.user.employeeId,
        cancelledLeave.user.lineUserId,
        message,
        'leave',
      );
    }

    return cancelledLeave;
  }
}
export function createLeaveServiceServer(
  prisma: PrismaClient,
  notificationService: NotificationService,
): LeaveServiceServer {
  return new LeaveServiceServer(prisma, notificationService);
}

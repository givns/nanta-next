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
    // Wrap everything in a transaction
    return await this.prisma
      .$transaction(async (tx) => {
        // Find user
        const user = await tx.user.findUnique({
          where: { lineUserId },
        });
        if (!user)
          throw new Error(`User not found for lineUserId: ${lineUserId}`);

        // Skip balance check for unpaid leave
        if (!this.isUnpaidLeave(leaveType)) {
          const leaveBalance = await this.checkLeaveBalance(user.employeeId);

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
        }
        // Prepare leave request data
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

        // Create leave request within transaction
        const newLeaveRequest = await tx.leaveRequest.create({
          data: leaveRequestData,
          include: { user: true },
        });

        // Update attendance records if the request is already approved
        // (unusual case, but handling it for completeness)
        if (newLeaveRequest.status === 'Approved') {
          await this.updateAttendanceRecords(newLeaveRequest, tx);
        }

        return newLeaveRequest;
      })

      .then(async (newLeaveRequest) => {
        // Handle notifications outside of transaction
        await this.notifyAdmins(newLeaveRequest);
        return newLeaveRequest;
      })
      .catch((error) => {
        console.error('Error creating leave request:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Failed to create leave request. Please try again.',
        );
      });
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
    approverId: string,
    replyToken?: string,
  ): Promise<LeaveRequest> {
    return await this.prisma
      .$transaction(async (tx) => {
        // Get both leave request and approver data at the start
        const [leaveRequest, approver] = await Promise.all([
          tx.leaveRequest.findUnique({
            where: { id: requestId },
            include: { user: true },
          }),
          tx.user.findUnique({
            where: { employeeId: approverId },
          }),
        ]);

        if (!leaveRequest) {
          throw new Error('Leave request not found');
        }

        if (!approver) {
          throw new Error('Approver not found');
        }

        // Only update leave balance for paid leave types
        if (!this.isUnpaidLeave(leaveRequest.leaveType)) {
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

          // Update user balance
          await tx.user.update({
            where: { id: leaveRequest.user.id },
            data: {
              [updateField]: newBalance,
            },
          });
        }
        // Update leave request status
        const approvedRequest = await tx.leaveRequest.update({
          where: { id: requestId },
          data: {
            status: 'Approved',
            approverId: approver.id, // Use approver.id instead of approverEmployeeId
            updatedAt: new Date(),
          },
          include: { user: true },
        });

        // Update attendance records
        await this.updateAttendanceRecords(approvedRequest, tx);

        return { approvedRequest, approver };
      })
      .then(async ({ approvedRequest, approver }) => {
        // Handle notifications and cache invalidation outside transaction
        await this.notificationService.sendRequestStatusNotificationWithReply(
          approvedRequest.user,
          approvedRequest,
          approver,
          'leave',
          'approved',
          replyToken,
        );
        await this.invalidateUserCache(approvedRequest.employeeId);
        return approvedRequest;
      });
  }

  // New helper method to handle attendance records
  private async updateAttendanceRecords(
    leaveRequest: LeaveRequest,
    tx: TransactionClient,
  ) {
    const { startDate, endDate, employeeId, leaveType } = leaveRequest;
    let currentDate = startDate;

    const regularHours = this.isUnpaidLeave(leaveType)
      ? 0
      : this.getRegularHoursForLeave(leaveRequest.leaveFormat);

    while (currentDate <= endDate) {
      // Create/Update attendance record
      const attendance = await tx.attendance.upsert({
        where: {
          employeeId_date: {
            employeeId,
            date: currentDate,
          },
        },
        create: {
          employeeId,
          date: currentDate,
          isDayOff: true,
          status: leaveType === 'ลาโดยไม่ได้รับค่าจ้าง' ? 'off' : 'incomplete',
          isManualEntry: true,
          version: 1,
        },
        update: {
          isDayOff: true,
          status: leaveType === 'ลาโดยไม่ได้รับค่าจ้าง' ? 'off' : 'incomplete',
          version: {
            increment: 1,
          },
        },
      });

      // Create/Update time entry for the leave day
      const timeEntryData: Prisma.TimeEntryUncheckedCreateInput = {
        employeeId: attendance.employeeId,
        date: attendance.date,
        startTime: attendance.date,
        endTime: attendance.date,
        regularHours, // Use the calculated regular hours
        overtimeHours: 0,
        actualMinutesLate: 0,
        isHalfDayLate: false,
        status: 'COMPLETED',
        attendanceId: attendance.id,
        entryType:
          leaveType === 'ลาโดยไม่ได้รับค่าจ้าง' ? 'unpaid_leave' : 'regular',
      };

      // Check for existing time entry
      const existingTimeEntry = await tx.timeEntry.findFirst({
        where: {
          AND: [
            { employeeId: attendance.employeeId },
            { date: attendance.date },
          ],
        },
      });

      if (existingTimeEntry) {
        await tx.timeEntry.update({
          where: { id: existingTimeEntry.id },
          data: timeEntryData,
        });
      } else {
        await tx.timeEntry.create({
          data: timeEntryData,
        });
      }

      currentDate = addDays(currentDate, 1);
    }

    // Invalidate relevant caches
    await this.invalidateUserCache(employeeId);
  }

  // Helper to determine regular hours based on leave format
  private getRegularHoursForLeave(leaveFormat: string): number {
    switch (leaveFormat) {
      case 'ลาครึ่งวัน':
        return 4;
      case 'ลาเต็มวัน':
        return 8;
      default:
        return 0;
    }
  }

  async denyLeaveRequest(
    requestId: string,
    denierEmployeeId: string,
    replyToken?: string,
  ): Promise<LeaveRequest> {
    const result = await this.prisma.$transaction(async (tx) => {
      const [leaveRequest, denier] = await Promise.all([
        tx.leaveRequest.findUnique({
          where: { id: requestId },
          include: { user: true },
        }),
        tx.user.findUnique({
          where: { employeeId: denierEmployeeId },
        }),
      ]);

      if (!leaveRequest) throw new Error('Leave request not found');
      if (!denier) throw new Error('Denier not found');

      const deniedRequest = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'Denied',
          denierId: denierEmployeeId,
          updatedAt: new Date(),
        },
        include: { user: true },
      });

      return { deniedRequest, denier };
    });

    // Send notifications outside transaction
    await this.notificationService.sendRequestStatusNotificationWithReply(
      result.deniedRequest.user,
      result.deniedRequest,
      result.denier,
      'leave',
      'denied',
      replyToken,
    );

    await this.invalidateUserCache(result.deniedRequest.employeeId);
    return result.deniedRequest;
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

  private isUnpaidLeave(leaveType: string): boolean {
    return leaveType === 'ลาโดยไม่ได้รับค่าจ้าง';
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

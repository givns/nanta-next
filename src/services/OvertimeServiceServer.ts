// services/OvertimeServiceServer.ts
import { PrismaClient, OvertimeRequest, Prisma } from '@prisma/client';
import { IOvertimeServiceServer } from '@/types/OvertimeService';
import { OvertimeNotificationService } from './OvertimeNotificationService';
import { TimeEntryService } from './TimeEntryService';
import { ApprovedOvertime } from '@/types/user';
import moment from 'moment-timezone';
import { NotificationService } from './NotificationService';

const prisma = new PrismaClient();

export class OvertimeServiceServer implements IOvertimeServiceServer {
  [x: string]: any;
  private overtimeNotificationService: OvertimeNotificationService;
  private timeEntryService: TimeEntryService;

  constructor() {
    this.overtimeNotificationService = new OvertimeNotificationService();
    this.timeEntryService = new TimeEntryService();
  }

  async createOvertimeRequest(
    lineUserId: string,
    date: string,
    startTime: string,
    endTime: string,
    reason: string,
    resubmitted: boolean = false,
    originalRequestId?: string,
  ): Promise<OvertimeRequest> {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) throw new Error('User not found');

    const overtimeRequestData: Prisma.OvertimeRequestCreateInput = {
      user: { connect: { id: user.id } },
      date: new Date(date),
      startTime,
      endTime,
      reason,
      status: 'pending',
      resubmitted,
      originalRequest: originalRequestId
        ? { connect: { id: originalRequestId } }
        : undefined,
    };

    const newOvertimeRequest = await prisma.overtimeRequest.create({
      data: overtimeRequestData,
      include: { user: true },
    });

    // Check if the request is less than 2 hours and auto-approve if it is
    const durationInHours = this.calculateOvertimeHours(startTime, endTime);
    if (durationInHours <= 1) {
      await this.autoApproveOvertimeRequest(newOvertimeRequest.id);
    } else {
      await this.overtimeNotificationService.sendOvertimeRequestNotification(
        newOvertimeRequest,
      );
    }

    return newOvertimeRequest;
  }

  private async autoApproveOvertimeRequest(
    requestId: string,
  ): Promise<OvertimeRequest> {
    const approvedRequest = await prisma.overtimeRequest.update({
      where: { id: requestId },
      data: { status: 'approved' },
      include: { user: true },
    });

    await this.timeEntryService.createPendingOvertimeEntry(approvedRequest);
    await this.overtimeNotificationService.sendOvertimeAutoApprovalNotification(
      approvedRequest,
    );

    return approvedRequest;
  }

  private calculateOvertimeHours(startTime: string, endTime: string): number {
    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);
    const diff = end.getTime() - start.getTime();
    return diff / (1000 * 60 * 60); // Convert milliseconds to hours
  }

  async batchApproveOvertimeRequests(
    requestIds: string[],
    approverId: string,
  ): Promise<OvertimeRequest[]> {
    const approvedRequests = await prisma.$transaction(
      requestIds.map((id) =>
        prisma.overtimeRequest.update({
          where: { id },
          data: { status: 'approved', approverId },
          include: { user: true },
        }),
      ),
    );

    const admin = await prisma.user.findUnique({ where: { id: approverId } });
    if (admin) {
      await this.overtimeNotificationService.sendBatchApprovalNotification(
        admin,
        approvedRequests,
      );
    }

    return approvedRequests;
  }
  async approveOvertimeRequest(
    requestId: string,
    lineUserId: string,
  ): Promise<OvertimeRequest> {
    const admin = await prisma.user.findUnique({ where: { lineUserId } });
    if (!admin) throw new Error('Admin not found');

    const overtimeRequest = await prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        approver: { connect: { id: admin.id } },
      },
      include: { user: true },
    });

    // Add any additional logic for approval notification here

    return overtimeRequest;
  }

  async initiateDenial(
    requestId: string,
    lineUserId: string,
  ): Promise<OvertimeRequest> {
    const admin = await prisma.user.findUnique({ where: { lineUserId } });
    if (!admin) throw new Error('Admin not found');

    const overtimeRequest = await prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: 'denialPending',
        approver: { connect: { id: admin.id } },
      },
      include: { user: true },
    });

    // Add any additional logic for initiating denial here

    return overtimeRequest;
  }

  async finalizeDenial(
    requestId: string,
    lineUserId: string,
    denialReason: string,
  ): Promise<OvertimeRequest> {
    const admin = await prisma.user.findUnique({ where: { lineUserId } });
    if (!admin) throw new Error('Admin not found');

    const overtimeRequest = await prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: 'denied',
        approver: { connect: { id: admin.id } },
        denialReason,
      },
      include: { user: true },
    });

    // Add any additional logic for denial notification here

    return overtimeRequest;
  }

  async getOvertimeRequests(employeeId: string): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllOvertimeRequests(): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  async getOriginalOvertimeRequest(
    requestId: string,
  ): Promise<OvertimeRequest | null> {
    return prisma.overtimeRequest.findUnique({
      where: { id: requestId },
    });
  }

  async getApprovedOvertimeRequest(
    employeeId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    const bangkokDate = moment(date).tz('Asia/Bangkok').startOf('day');

    const overtimeRequest = await prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: bangkokDate.toDate(),
          lt: bangkokDate.clone().add(1, 'day').toDate(),
        },
        status: 'approved',
      },
    });

    if (!overtimeRequest) {
      return null;
    }

    return {
      id: overtimeRequest.id,
      employeeId: overtimeRequest.employeeId,
      date: overtimeRequest.date,
      startTime: overtimeRequest.startTime, // Don't convert, it's already in the correct format
      endTime: overtimeRequest.endTime, // Don't convert, it's already in the correct format
      status: overtimeRequest.status,
      reason: overtimeRequest.reason || null,
      approvedBy: overtimeRequest.approverId || '',
      approvedAt: overtimeRequest.updatedAt, // Keep as is, it's already in UTC
    };
  }

  async getFutureApprovedOvertimes(
    employeeId: string,
    startDate: Date,
  ): Promise<ApprovedOvertime[]> {
    try {
      const futureOvertimes = await prisma.approvedOvertime.findMany({
        where: {
          employeeId: employeeId,
          date: {
            gte: startDate,
          },
          status: 'APPROVED', // Assuming you have a status field
        },
        orderBy: {
          date: 'asc',
        },
      });

      return futureOvertimes.map((overtime) => ({
        id: overtime.id,
        employeeId: overtime.employeeId,
        date: overtime.date,
        startTime: overtime.startTime.toISOString(), // Convert startTime to string
        endTime: overtime.endTime.toISOString(), // Convert endTime to string
        status: overtime.status,
        reason: '', // Add the 'reason' property with an appropriate value
        approvedBy: overtime.approvedBy,
        approvedAt: overtime.approvedAt,
      }));
    } catch (error) {
      console.error('Error getting future approved overtimes:', error);
      throw error;
    }
  }

  async getPendingOvertimeRequests(): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      where: {
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async createUnapprovedOvertime(
    employeeId: string,
    startTime: Date,
    endTime: Date,
    overtimeMinutes: number,
  ): Promise<void> {
    const overtimeRequest = await prisma.overtimeRequest.create({
      data: {
        employeeId,
        date: startTime,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: 'pending',
        reason: `Unapproved overtime: ${overtimeMinutes} minutes`,
      },
    });

    // Fetch admins
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
    });

    // Send notifications to admins
    for (const admin of admins) {
      await this.notificationService.sendNotification(
        admin.id,
        `New unapproved overtime request from user ${employeeId} for ${overtimeMinutes} minutes. Please review.`,
      );
    }
  }
}

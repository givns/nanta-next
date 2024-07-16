// services/OvertimeServiceServer.ts
import { PrismaClient, OvertimeRequest, Prisma } from '@prisma/client';
import { IOvertimeServiceServer } from '@/types/OvertimeService';
import { OvertimeNotificationService } from './OvertimeNotificationService';
import { TimeEntryService } from './TimeEntryService';
import { ApprovedOvertime } from '@/types/user';

const prisma = new PrismaClient();

export class OvertimeServiceServer implements IOvertimeServiceServer {
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
    if (durationInHours <= 2) {
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

  async getOvertimeRequests(userId: string): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      where: { userId },
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
    userId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    const overtimeRequest = await prisma.overtimeRequest.findFirst({
      where: {
        userId,
        date: {
          equals: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        },
        status: 'approved',
      },
    });

    if (!overtimeRequest) {
      return null;
    }

    return {
      id: overtimeRequest.id,
      userId: overtimeRequest.userId,
      date: overtimeRequest.date,
      startTime: new Date(overtimeRequest.startTime),
      endTime: new Date(overtimeRequest.endTime),
      status: overtimeRequest.status,
      approvedBy: overtimeRequest.approverId || '',
      approvedAt: overtimeRequest.updatedAt,
    };
  }

  async getPendingOvertimeRequests(): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      where: {
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

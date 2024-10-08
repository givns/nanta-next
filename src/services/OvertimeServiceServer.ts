// services/OvertimeServiceServer.ts
import { PrismaClient, OvertimeRequest, Prisma, User } from '@prisma/client';
import { IOvertimeServiceServer } from '@/types/OvertimeService';
import { TimeEntryService } from './TimeEntryService';
import { ApprovedOvertime } from '@/types/attendance';
import {
  parseISO,
  format,
  startOfDay,
  endOfDay,
  differenceInHours,
  differenceInMinutes,
} from 'date-fns';
import { NotificationService } from './NotificationService';

const prisma = new PrismaClient();

export class OvertimeServiceServer implements IOvertimeServiceServer {
  constructor(
    private prisma: PrismaClient,
    private timeEntryService: TimeEntryService,
    private notificationService: NotificationService,
  ) {}

  async createOvertimeRequest(
    lineUserId: string,
    date: string,
    startTime: string,
    endTime: string,
    reason: string,
    resubmitted: boolean,
    originalRequestId?: string,
  ): Promise<OvertimeRequest> {
    const user = await this.prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      throw new Error('User not found');
    }
    const overtimeRequestData: Prisma.OvertimeRequestCreateInput = {
      user: { connect: { id: user.id } },
      date: parseISO(date),
      startTime,
      endTime,
      reason,
      status: 'pending',
      resubmitted,
      originalRequest: originalRequestId
        ? { connect: { id: originalRequestId } }
        : undefined,
    };

    const newOvertimeRequest = await this.prisma.overtimeRequest.create({
      data: overtimeRequestData,
      include: { user: true },
    });

    await this.timeEntryService.createPendingOvertimeEntry(newOvertimeRequest);

    const durationInHours = differenceInHours(
      parseISO(endTime),
      parseISO(startTime),
    );
    if (durationInHours <= 1) {
      await this.autoApproveOvertimeRequest(newOvertimeRequest.id);
    } else {
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
      });
      for (const admin of admins) {
        await this.notificationService.sendOvertimeApprovalNotification(
          newOvertimeRequest,
          admin.employeeId,
        );
      }
    }

    return newOvertimeRequest;
  }

  async getApprovedOvertimeRequest(
    employeeId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    const overtimeRequest = await this.prisma.approvedOvertime.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        status: 'APPROVED',
      },
    });

    if (!overtimeRequest) return null;

    return {
      ...overtimeRequest,
      startTime: overtimeRequest.startTime.toISOString().substr(11, 8), // Convert to HH:mm:ss string
      endTime: overtimeRequest.endTime.toISOString().substr(11, 8), // Convert to HH:mm:ss string
    };
  }

  async getFutureApprovedOvertimes(
    employeeId: string,
    startDate: Date,
  ): Promise<ApprovedOvertime[]> {
    const futureOvertimes = await this.prisma.approvedOvertime.findMany({
      where: {
        employeeId,
        date: { gte: startOfDay(startDate) },
        status: 'APPROVED',
      },
      orderBy: { date: 'asc' },
    });

    return futureOvertimes.map((overtime) => ({
      ...overtime,
      reason: overtime.reason || null,
      startTime: format(parseISO(overtime.startTime.toString()), 'HH:mm:ss'),
      endTime: format(parseISO(overtime.endTime.toString()), 'HH:mm:ss'),
    }));
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
    await this.notificationService.sendOvertimeAutoApprovalNotification(
      approvedRequest,
    );

    return approvedRequest;
  }

  async batchApproveOvertimeRequests(
    requestIds: string[],
    approverId: string,
  ): Promise<OvertimeRequest[]> {
    const approvedRequests = await this.prisma.$transaction(
      requestIds.map((id) =>
        this.prisma.overtimeRequest.update({
          where: { id },
          data: { status: 'approved', approverId },
          include: { user: true },
        }),
      ),
    );

    for (const request of approvedRequests) {
      await this.timeEntryService.createPendingOvertimeEntry(request);
      await this.notificationService.sendOvertimeApprovalNotification(
        request,
        approverId,
      );
    }

    return approvedRequests;
  }

  async approveOvertimeRequest(
    requestId: string,
    approverId: string,
  ): Promise<OvertimeRequest> {
    const overtimeRequest = await this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        approverId,
      },
      include: { user: true },
    });

    await this.timeEntryService.createPendingOvertimeEntry(overtimeRequest);

    const approver = await this.prisma.user.findUnique({
      where: { id: approverId },
    });
    if (approver) {
      await this.notificationService.sendOvertimeApprovalNotification(
        overtimeRequest,
        approver.employeeId,
      );
    }

    return overtimeRequest;
  }

  async getApprovedOvertimesInRange(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ApprovedOvertime[]> {
    const overtimes = await this.prisma.approvedOvertime.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    return overtimes.map((overtime) => ({
      ...overtime,
      reason: overtime.reason || null,
      startTime: overtime.startTime.toISOString(), // Convert startTime to string
      endTime: overtime.endTime.toISOString(), // Convert endTime to string
    }));
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

  async handleOvertimeRequest(
    requestId: string,
    approverId: string,
    action: 'approve' | 'deny',
    denialReason?: string,
  ): Promise<OvertimeRequest> {
    const data: Prisma.OvertimeRequestUpdateInput = {
      status: action === 'approve' ? 'approved' : 'denied',
      approver: { connect: { id: approverId } },
    };

    const overtimeRequest = await this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data,
      include: { user: true },
    });

    if (action === 'approve') {
      await this.timeEntryService.createPendingOvertimeEntry(overtimeRequest);
      await this.notificationService.sendOvertimeApprovalNotification(
        overtimeRequest,
        approverId,
      );
    } else if (action === 'deny' && denialReason) {
      await this.notificationService.sendOvertimeDenialNotification(
        overtimeRequest,
        approverId,
      );
    }

    return overtimeRequest;
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
        'overtime',
        'overtime', // Add the missing argument here
      );
    }
  }

  async calculateOvertimeHours(
    startTime: string,
    endTime: string,
  ): Promise<number> {
    const start = parseISO(startTime);
    const end = parseISO(endTime);
    const totalMinutes = differenceInMinutes(end, start);
    const roundedMinutes = Math.floor(totalMinutes / 30) * 30;
    return roundedMinutes / 60;
  }
}

// services/OvertimeServiceServer.ts

import { PrismaClient, OvertimeRequest, Prisma } from '@prisma/client';
import { IOvertimeServiceServer } from '@/types/OvertimeService';
import { notifyAdmins } from '@/utils/sendRequestNotification';

const prisma = new PrismaClient();

export class OvertimeServiceServer implements IOvertimeServiceServer {
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

    await notifyAdmins(newOvertimeRequest, 'overtime');

    return newOvertimeRequest;
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
  ): Promise<OvertimeRequest | null> {
    return prisma.overtimeRequest.findFirst({
      where: {
        userId,
        date,
        status: 'approved',
      },
    });
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

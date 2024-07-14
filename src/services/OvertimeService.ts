// services/OvertimeService.ts

import { PrismaClient, OvertimeRequest } from '@prisma/client';

const prisma = new PrismaClient();

export class OvertimeService {
  async createOvertimeRequest(
    userId: string,
    date: Date,
    startTime: string,
    endTime: string,
    reason: string,
  ): Promise<OvertimeRequest> {
    return prisma.overtimeRequest.create({
      data: {
        userId,
        date,
        startTime,
        endTime,
        reason,
        status: 'pending',
      },
    });
  }

  async getApprovedOvertimeRequest(
    userId: string,
    date: Date,
  ): Promise<OvertimeRequest | null> {
    return prisma.overtimeRequest.findFirst({
      where: {
        userId,
        date: {
          equals: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        },
        status: 'approved',
      },
    });
  }

  async approveOvertimeRequest(requestId: string): Promise<OvertimeRequest> {
    return prisma.overtimeRequest.update({
      where: { id: requestId },
      data: { status: 'approved' },
    });
  }

  async denyOvertimeRequest(requestId: string): Promise<OvertimeRequest> {
    return prisma.overtimeRequest.update({
      where: { id: requestId },
      data: { status: 'denied' },
    });
  }

  async getPendingOvertimeRequests(): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      where: { status: 'pending' },
      include: { user: true },
    });
  }

  async getUserOvertimeRequests(userId: string): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }
}

// services/OvertimeServiceClient.ts

import { PrismaClient, OvertimeRequest, Prisma } from '@prisma/client';
import { IOvertimeServiceClient } from '@/types/OvertimeService';

const prisma = new PrismaClient();

export class OvertimeServiceClient implements IOvertimeServiceClient {
  async createOvertimeRequest(
    lineUserId: string,
    date: string,
    startTime: string,
    endTime: string,
    reason: string,
    isDayOff: boolean,
  ): Promise<OvertimeRequest> {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) throw new Error('User not found');

    const overtimeRequestData: Prisma.OvertimeRequestCreateInput = {
      user: { connect: { id: user.id } },
      name: user.name,
      date: new Date(date),
      startTime,
      endTime,
      reason,
      status: 'pending_response',
      employeeResponse: null,
      isDayOffOvertime: isDayOff,
    };

    const newOvertimeRequest = await prisma.overtimeRequest.create({
      data: overtimeRequestData,
    });

    return newOvertimeRequest;
  }

  async getOvertimeRequests(employeeId: string): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      where: { employeeId },
      orderBy: { date: 'desc' },
    });
  }

  async getAllOvertimeRequests(): Promise<OvertimeRequest[]> {
    return prisma.overtimeRequest.findMany({
      orderBy: { date: 'desc' },
      include: { user: true },
    });
  }

  async getOriginalOvertimeRequest(
    requestId: string,
  ): Promise<OvertimeRequest> {
    const overtimeRequest = await prisma.overtimeRequest.findUnique({
      where: { id: requestId },
    });

    if (!overtimeRequest) {
      throw new Error('Original overtime request not found');
    }

    return overtimeRequest;
  }
}

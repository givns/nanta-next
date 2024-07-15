// @/types/OvertimeService.ts

import { OvertimeRequest } from '@prisma/client';

export interface IOvertimeServiceBase {
  createOvertimeRequest(
    lineUserId: string,
    date: string,
    startTime: string,
    endTime: string,
    reason: string,
    resubmitted?: boolean,
    originalRequestId?: string,
  ): Promise<OvertimeRequest>;
  getOvertimeRequests(userId: string): Promise<OvertimeRequest[]>;
  getAllOvertimeRequests(): Promise<OvertimeRequest[]>;
  getOriginalOvertimeRequest(
    requestId: string,
  ): Promise<OvertimeRequest | null>;
}

export interface IOvertimeServiceClient extends IOvertimeServiceBase {}

export interface IOvertimeServiceServer extends IOvertimeServiceBase {
  approveOvertimeRequest(
    requestId: string,
    lineUserId: string,
  ): Promise<OvertimeRequest>;
  initiateDenial(
    requestId: string,
    lineUserId: string,
  ): Promise<OvertimeRequest>;
  finalizeDenial(
    requestId: string,
    lineUserId: string,
    denialReason: string,
  ): Promise<OvertimeRequest>;
  getApprovedOvertimeRequest(
    userId: string,
    date: Date,
  ): Promise<OvertimeRequest | null>;
  getPendingOvertimeRequests(): Promise<OvertimeRequest[]>;
}

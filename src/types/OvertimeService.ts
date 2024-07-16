// @/types/OvertimeService.ts

import { OvertimeRequest } from '@prisma/client';
import { ApprovedOvertime } from './user'; // Make sure to import ApprovedOvertime

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
  ): Promise<ApprovedOvertime | null>; // Changed return type to ApprovedOvertime
  getPendingOvertimeRequests(): Promise<OvertimeRequest[]>;
}

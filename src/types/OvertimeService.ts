// @/types/OvertimeService.ts

import { OvertimeRequest } from '@prisma/client';
import { ApprovedOvertime } from '@prisma/client'; // Import ApprovedOvertime from the correct file path

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
  handleOvertimeRequest(
    requestId: string,
    approverId: string,
    action: 'approve' | 'deny',
  ): Promise<OvertimeRequest>;
  getApprovedOvertimeRequest(
    employeeId: string,
    date: Date,
  ): Promise<{
    id: string;
    employeeId: string;
    startTime: string; // Changed to string
    endTime: string; // Changed to string
    reason: string | null;
    status: string;
    approvedBy: string;
    approvedAt: Date;
    date: Date;
  } | null>;
  getPendingOvertimeRequests(): Promise<OvertimeRequest[]>;
  createUnapprovedOvertime(
    userId: string,
    startTime: Date,
    endTime: Date,
    overtimeMinutes: number,
  ): Promise<void>;
}

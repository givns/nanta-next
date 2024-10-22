// @/types/OvertimeService.ts

import { OvertimeRequest } from '@prisma/client';
import { ApprovedOvertime, ExtendedApprovedOvertime } from './attendance';
export interface IOvertimeServiceBase {
  createOvertimeRequest(
    lineUserId: string,
    date: string,
    startTime: string,
    endTime: string,
    reason: string,
    isDayOff: boolean,
  ): Promise<OvertimeRequest>;
}

export interface IOvertimeServiceClient extends IOvertimeServiceBase {}

export interface IOvertimeServiceServer extends IOvertimeServiceBase {
  employeeRespondToOvertimeRequest(
    requestId: string,
    employeeId: string,
    response: 'approve' | 'deny',
  ): Promise<{ updatedRequest: OvertimeRequest; message: string }>;

  adminApproveOvertimeRequest(
    requestId: string,
    adminEmployeeId: string,
    approved: boolean,
  ): Promise<OvertimeRequest>;

  getApprovedOvertimeRequest(
    employeeId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null>;

  getPendingOvertimeRequests(
    employeeId: string,
    date: Date,
  ): Promise<OvertimeRequest | null>;

  getDayOffOvertimeRequest(
    employeeId: string,
    date: Date,
  ): Promise<OvertimeRequest | null>;

  getDetailedOvertimesInRange(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ExtendedApprovedOvertime[]>;

  getFutureApprovedOvertimes(
    employeeId: string,
    startDate: Date,
  ): Promise<ApprovedOvertime[]>;

  calculateOvertimeHours(startTime: string, endTime: string): Promise<number>;
}

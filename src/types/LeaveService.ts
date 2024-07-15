// @/types/LeaveService.ts

import { LeaveRequest } from '@prisma/client';

export interface ILeaveServiceBase {
  createLeaveRequest(
    lineUserId: string,
    leaveType: string,
    leaveFormat: string,
    reason: string,
    startDate: string,
    endDate: string,
    fullDayCount: number,
    useOvertimeHours: boolean,
    resubmitted?: boolean,
    originalRequestId?: string,
  ): Promise<LeaveRequest>;
  getLeaveRequests(userId: string): Promise<LeaveRequest[]>;
  getAllLeaveRequests(): Promise<LeaveRequest[]>;
  getOriginalLeaveRequest(requestId: string): Promise<LeaveRequest>;
  checkLeaveBalance(userId: string): Promise<number>;
}

export interface ILeaveServiceClient extends ILeaveServiceBase {}

export interface ILeaveServiceServer extends ILeaveServiceBase {
  approveLeaveRequest(
    requestId: string,
    lineUserId: string,
  ): Promise<LeaveRequest>;
  initiateDenial(requestId: string, lineUserId: string): Promise<LeaveRequest>;
  finalizeDenial(
    requestId: string,
    lineUserId: string,
    denialReason: string,
  ): Promise<LeaveRequest>;
}

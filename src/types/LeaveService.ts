// @/types/LeaveService.ts

import { LeaveRequest } from '@prisma/client';

export interface LeaveBalanceData {
  sickLeave: number;
  businessLeave: number;
  annualLeave: number;
}

export interface ILeaveServiceBase {
  createLeaveRequest(
    lineUserId: string,
    leaveType: string,
    leaveFormat: string,
    reason: string,
    startDate: string,
    endDate: string,
    fullDayCount: number,
    resubmitted?: boolean,
    originalRequestId?: string,
  ): Promise<LeaveRequest>;
  getLeaveRequests(userId: string): Promise<LeaveRequest[]>;
  getAllLeaveRequests(): Promise<LeaveRequest[]>;
  checkLeaveBalance(userId: string): Promise<LeaveBalanceData>;
}

export interface ILeaveServiceServer extends ILeaveServiceBase {
  approveLeaveRequest(
    requestId: string,
    lineUserId: string,
  ): Promise<LeaveRequest>;
  denyLeaveRequest(
    requestId: string,
    lineUserId: string,
  ): Promise<LeaveRequest>;
}

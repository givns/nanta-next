import { LeaveRequest } from '@prisma/client';

export interface ILeaveService {
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
  getOriginalLeaveRequest(requestId: string): Promise<LeaveRequest>;
  checkLeaveBalance(userId: string): Promise<number>;
  getLeaveRequests(userId: string): Promise<LeaveRequest[]>;
  getAllLeaveRequests(): Promise<LeaveRequest[]>;
}

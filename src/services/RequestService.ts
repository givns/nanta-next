// services/RequestService.ts

import { PrismaClient, User } from '@prisma/client';
import { NotificationService } from './NotificationService';

export abstract class RequestService {
  constructor(
    protected prisma: PrismaClient,
    protected notificationService: NotificationService,
  ) {}

  protected abstract getRequestModel(): any;
  protected abstract getRequestType(): 'leave' | 'overtime';

  async approveRequest(requestId: string, approverEmployeeId: string) {
    const approver = await this.getUserByEmployeeId(approverEmployeeId);
    if (!approver) throw new Error('Approver not found');

    const request = await this.getRequestModel().update({
      where: { id: requestId },
      data: { status: 'Approved', approverId: approver.id },
      include: { user: true },
    });

    await this.notificationService.sendApprovalNotification(
      request.user.employeeId,
      request,
      approver.employeeId,
      this.getRequestType(),
    );

    return request;
  }

  async initiateDenial(requestId: string, denierEmployeeId: string) {
    const denier = await this.getUserByEmployeeId(denierEmployeeId);
    if (!denier) throw new Error('Denier not found');

    const request = await this.getRequestModel().update({
      where: { id: requestId },
      data: { status: 'DenialPending', approverId: denier.id },
      include: { user: true },
    });

    await this.notificationService.sendDenialInitiationNotification(
      denierEmployeeId,
      requestId,
      this.getRequestType(),
    );

    return request;
  }

  async finalizeDenial(
    requestId: string,
    denierEmployeeId: string,
    denialReason: string,
  ) {
    const denier = await this.getUserByEmployeeId(denierEmployeeId);
    if (!denier) throw new Error('Denier not found');

    const request = await this.getRequestModel().update({
      where: { id: requestId },
      data: { status: 'Denied', denialReason },
      include: { user: true },
    });

    await this.notificationService.sendDenialNotification(
      request.user.employeeId,
      request,
      denierEmployeeId,
      this.getRequestType(),
      denialReason,
    );

    return request;
  }

  protected async getOriginalRequest(requestId: string) {
    const request = await this.getRequestModel().findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error(`Original ${this.getRequestType()} request not found`);
    }

    return request;
  }

  private async getUserByEmployeeId(employeeId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { employeeId } });
  }
}
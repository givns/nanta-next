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
      request.user,
      request,
      approver,
      this.getRequestType(),
    );

    return request;
  }

  async denyRequest(requestId: string, denierEmployeeId: string) {
    const denier = await this.getUserByEmployeeId(denierEmployeeId);
    if (!denier) throw new Error('Approver not found');

    const request = await this.getRequestModel().update({
      where: { id: requestId },
      data: { status: 'Denied', denierId: denier.id },
      include: { user: true },
    });

    await this.notificationService.sendDenialNotification(
      request.user,
      request,
      denier,
      this.getRequestType(),
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

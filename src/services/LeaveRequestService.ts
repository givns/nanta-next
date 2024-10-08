// services/LeaveRequestService.ts
import { PrismaClient } from '@prisma/client';
import { RequestService } from './RequestService';
import { NotificationService } from './NotificationService';

export class LeaveRequestService extends RequestService {
  constructor(prisma: PrismaClient, notificationService: NotificationService) {
    super(prisma, notificationService);
  }

  protected getRequestModel() {
    return this.prisma.leaveRequest;
  }

  protected getRequestType(): 'leave' | 'overtime' {
    return 'leave';
  }
}

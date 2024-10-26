// services/RequestService.ts

import {
  PrismaClient,
  User,
  LeaveRequest,
  OvertimeRequest,
} from '@prisma/client';
import { NotificationService } from './NotificationService';

type RequestTypes = LeaveRequest | OvertimeRequest;

export abstract class RequestService {
  constructor(
    protected prisma: PrismaClient,
    protected notificationService: NotificationService,
  ) {}

  protected abstract getRequestModel(): any;
  protected abstract getRequestType(): 'leave' | 'overtime';

  protected async denyRequest(
    requestId: string,
    denierEmployeeId: string,
    replyToken?: string,
  ) {
    return await this.prisma
      .$transaction(async (tx) => {
        const [request, denier] = await Promise.all([
          this.getRequestModel().findUnique({
            where: { id: requestId },
            include: { user: true },
          }),
          this.getUserByEmployeeId(denierEmployeeId),
        ]);

        if (!request)
          throw new Error(`${this.getRequestType()} request not found`);
        if (!denier) throw new Error('Denier not found');

        if (request.status !== 'Pending') {
          throw new Error('Leave request has already been processed');
        }

        const deniedRequest = await this.getRequestModel().update({
          where: { id: requestId },
          data: {
            status: 'Denied',
            denierId: denierEmployeeId,
            updatedAt: new Date(),
          },
          include: { user: true },
        });

        return { deniedRequest, denier };
      })
      .then(async ({ deniedRequest, denier }) => {
        // Send notifications outside transaction
        await this.notificationService.sendRequestStatusNotificationWithReply(
          deniedRequest.user,
          deniedRequest,
          denier,
          this.getRequestType(),
          'denied',
          replyToken,
        );

        return deniedRequest;
      });
  }

  protected async getOriginalRequest(requestId: string): Promise<RequestTypes> {
    const request = await this.getRequestModel().findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new Error(`Original ${this.getRequestType()} request not found`);
    }

    return request;
  }

  protected async getUserByEmployeeId(
    employeeId: string,
  ): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { employeeId },
      include: {
        department: true,
      },
    });
  }

  protected async validateUser(employeeId: string): Promise<User> {
    const user = await this.getUserByEmployeeId(employeeId);
    if (!user) {
      throw new Error(`User not found with employeeId: ${employeeId}`);
    }
    return user;
  }

  protected async validateRequest(
    requestId: string,
  ): Promise<RequestTypes & { user: User }> {
    const request = await this.getRequestModel().findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new Error(
        `${this.getRequestType()} request not found: ${requestId}`,
      );
    }

    return request;
  }
}

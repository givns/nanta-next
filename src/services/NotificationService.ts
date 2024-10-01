// NotificationService.ts

import { Client, FlexComponent, FlexMessage } from '@line/bot-sdk';
import {
  PrismaClient,
  User,
  LeaveRequest,
  OvertimeRequest,
  ShiftAdjustmentRequest,
} from '@prisma/client';
import {
  generateApprovalMessage,
  generateApprovalMessageForAdmins,
} from '../utils/generateApprovalMessage';
import {
  generateDenialMessage,
  generateDenialMessageForAdmins,
} from '../utils/generateDenialMessage';
import { format } from 'date-fns';
import { NotificationQueue } from './NotificationQueue';

export class NotificationService {
  private notificationQueue: NotificationQueue;
  private lineClient: Client;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.lineClient = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    });
    this.prisma = prisma;
    this.notificationQueue = new NotificationQueue(
      this.lineClient,
      this.prisma,
    );
  }

  async sendNotification(
    userId: string,
    message: string,
    type:
      | 'check-in'
      | 'check-out'
      | 'leave'
      | 'overtime'
      | 'overtime-digest'
      | 'overtime-batch-approval'
      | 'shift',
  ): Promise<void> {
    await this.notificationQueue.addNotification({ userId, message, type });
  }

  async sendCheckInConfirmation(
    userId: string,
    checkInTime: Date,
  ): Promise<void> {
    const message = `${format(checkInTime, 'HH:mm')}: บันทึกเวลาเข้างานเรียบร้อยแล้ว`;
    await this.sendNotification(userId, message, 'check-in');
  }

  async sendCheckOutConfirmation(
    userId: string,
    checkOutTime: Date,
  ): Promise<void> {
    const message = `${format(checkOutTime, 'HH:mm')}: บันทึกเวลาออกงานเรียบร้อยแล้ว`;
    await this.sendNotification(userId, message, 'check-out');
  }

  private async sendLineMessage(
    lineUserId: string,
    message: string,
  ): Promise<void> {
    try {
      await this.lineClient.pushMessage(lineUserId, {
        type: 'text',
        text: message,
      });
      console.log(`Notification sent to LINE user ${lineUserId}: ${message}`);
    } catch (error) {
      console.error('Error sending LINE message:', error);
      throw new Error('Failed to send LINE message');
    }
  }

  async sendMissingCheckInNotification(lineUserId: string): Promise<void> {
    const message = 'คุณยังไม่ได้ลงเวลาเข้างานวันนี้ กรุณาลงเวลาโดยเร็วที่สุด';
    await this.sendLineMessage(lineUserId, message);
  }

  async sendApprovedRequestNotification(
    lineUserId: string,
    requestType: 'leave' | 'overtime',
  ): Promise<void> {
    const message = `คำขอ${requestType === 'leave' ? 'ลา' : 'ทำงานล่วงเวลา'}ของคุณได้รับการอนุมัติแล้ว`;
    await this.sendLineMessage(lineUserId, message);
  }

  async sendOvertimeApprovalNotification(
    overtimeRequest: OvertimeRequest & { user: User },
    approver: User,
  ): Promise<void> {
    if (!overtimeRequest.user.lineUserId) {
      console.warn(
        'No LINE user ID provided for overtime approval notification',
      );
      return;
    }

    const message = `คำขอทำงานล่วงเวลา ${overtimeRequest.date.toDateString()} (${overtimeRequest.startTime} - ${overtimeRequest.endTime}) ได้รับการอนุมิติโดย ${approver.name}.`;
    await this.sendNotification(
      overtimeRequest.employeeId,
      message,
      'overtime',
    );
  }

  async sendOvertimeAutoApprovalNotification(
    overtimeRequest: OvertimeRequest & { user: User },
  ): Promise<void> {
    if (!overtimeRequest.user.lineUserId) {
      console.warn(
        'No LINE user ID provided for overtime auto-approval notification',
      );
      return;
    }

    const message = `คำขอทำงานล่วงเวลา ${overtimeRequest.date.toDateString()} (${overtimeRequest.startTime} - ${overtimeRequest.endTime}) ได้รับการอนุมิติโดยระบบอัตโนมัติ`;
    await this.sendNotification(
      overtimeRequest.employeeId,
      message,
      'overtime',
    );
  }

  async sendRequestNotification(
    admin: User,
    request: LeaveRequest | OvertimeRequest,
    requestType: 'leave' | 'overtime',
  ): Promise<void> {
    const requestCount = await this.getRequestCountForAdmin(admin.id);
    const user = await this.prisma.user.findUnique({
      where: { id: request.employeeId },
    });

    if (!user) {
      throw new Error(`User with ID ${request.employeeId} not found`);
    }

    const message = this.createRequestFlexMessage(
      user,
      request,
      requestType,
      requestCount,
      admin,
    );
    if (admin.lineUserId) {
      await this.lineClient.pushMessage(admin.lineUserId, message);
    } else {
      console.warn('No LINE user ID provided for admin');
    }
  }

  async sendApprovalNotification(
    user: User,
    request: LeaveRequest | OvertimeRequest,
    approver: User,
    requestType: 'leave' | 'overtime',
  ): Promise<void> {
    if (!user.lineUserId) {
      console.warn('No LINE user ID provided for approval notification');
      return;
    }

    const message = generateApprovalMessage(user, request, requestType);
    await this.lineClient.pushMessage(user.lineUserId, message);

    const adminMessage = generateApprovalMessageForAdmins(
      user,
      request,
      approver,
      requestType,
    );
    const admins = await this.getAdmins();
    for (const admin of admins) {
      if (admin.lineUserId) {
        await this.lineClient.pushMessage(admin.lineUserId, adminMessage);
      }
    }
  }

  async sendDenialNotification(
    user: User,
    request: LeaveRequest | OvertimeRequest,
    denier: User,
    requestType: 'leave' | 'overtime',
    denialReason: string,
  ): Promise<void> {
    if (!user.lineUserId) {
      console.warn('No LINE user ID provided for denial notification');
      return;
    }

    const message = generateDenialMessage(
      user,
      request,
      denialReason,
      requestType,
    );
    await this.lineClient.pushMessage(user.lineUserId, message);

    const adminMessage = generateDenialMessageForAdmins(
      user,
      request,
      denier,
      denialReason,
      requestType,
    );
    const admins = await this.getAdmins();
    for (const admin of admins) {
      if (admin.lineUserId) {
        await this.lineClient.pushMessage(admin.lineUserId, adminMessage);
      }
    }
  }

  async sendShiftAdjustmentNotification(
    userId: string,
    shiftAdjustment: ShiftAdjustmentRequest & {
      requestedShift: { name: string };
    },
  ): Promise<void> {
    const message = `Your shift for ${format(shiftAdjustment.date, 'yyyy-MM-dd')} has been adjusted to ${shiftAdjustment.requestedShift.name}`;
    await this.sendNotification(userId, message, 'shift'); // Assuming shift adjustments are related to leave
  }

  async sendPotentialOvertimeNotification(
    adminId: string,
    employeeId: string,
    date: Date,
    duration: number,
  ): Promise<void> {
    const message = `Employee ${employeeId} has potential overtime of ${duration} minutes on ${format(date, 'yyyy-MM-dd')}. Please review.`;
    await this.sendNotification(adminId, message, 'overtime');
  }

  private async getRequestCountForAdmin(adminId: string): Promise<number> {
    const now = new Date();
    const currentMonthStart =
      now.getDate() < 26
        ? new Date(now.getFullYear(), now.getMonth() - 1, 26)
        : new Date(now.getFullYear(), now.getMonth(), 26);

    const [leaveRequests, overtimeRequests] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: {
          createdAt: { gte: currentMonthStart },
          status: 'PENDING',
        },
      }),
      this.prisma.overtimeRequest.count({
        where: {
          createdAt: { gte: currentMonthStart },
          status: 'PENDING',
        },
      }),
    ]);

    return leaveRequests + overtimeRequests;
  }

  async sendOvertimeDigest(
    managerId: string,
    pendingRequests: OvertimeRequest[],
  ): Promise<void> {
    const message = this.createDigestMessage(pendingRequests);
    await this.notificationQueue.addNotification({
      userId: managerId,
      message: JSON.stringify(message),
      type: 'overtime-digest',
    });
  }

  async sendBatchApprovalNotification(
    admin: User,
    approvedRequests: OvertimeRequest[],
  ): Promise<void> {
    const message = this.createBatchApprovalMessage(approvedRequests);
    if (admin.lineUserId) {
      await this.notificationQueue.addNotification({
        userId: admin.id,
        message: JSON.stringify(message),
        type: 'overtime-batch-approval',
      });
    }
  }

  private createBatchApprovalMessage(
    approvedRequests: OvertimeRequest[],
  ): FlexMessage {
    // Implement the batch approval message creation logic
    return {
      type: 'flex',
      altText: 'Overtime Requests Batch Approval',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'Overtime Requests Approved',
              weight: 'bold',
              size: 'xl',
            },
            {
              type: 'text',
              text: `You have approved ${approvedRequests.length} overtime requests.`,
              margin: 'md',
            },
            // Add more details about the approved requests here
          ],
        },
      },
    };
  }

  private createDigestMessage(pendingRequests: OvertimeRequest[]): FlexMessage {
    return {
      type: 'flex',
      altText: 'Overtime Requests Digest',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'Overtime Requests Digest',
              weight: 'bold',
              size: 'xl',
            },
            {
              type: 'text',
              text: `You have ${pendingRequests.length} pending overtime requests.`,
              margin: 'md',
            },
            // Add more details about the pending requests here
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: 'View Requests',
                uri: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/overtime`,
              },
              style: 'primary',
            },
          ],
        },
      },
    };
  }

  async sendOvertimeRequestNotification(
    overtimeRequest: OvertimeRequest,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { employeeId: overtimeRequest.employeeId },
    });
    if (!user || !user.lineUserId) {
      console.warn('User not found or no LINE user ID available');
      return;
    }

    const message = {
      type: 'flex',
      altText: 'Overtime Request',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'Overtime Request',
              weight: 'bold',
              size: 'xl',
            },
            {
              type: 'text',
              text: `Date: ${overtimeRequest.date.toLocaleDateString()}`,
            },
            {
              type: 'text',
              text: `Time: ${overtimeRequest.startTime} - ${overtimeRequest.endTime}`,
            },
            {
              type: 'text',
              text: `Reason: ${overtimeRequest.reason}`,
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'postback',
                label: 'Accept',
                data: `action=accept&requestId=${overtimeRequest.id}`,
              },
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: 'Decline',
                data: `action=decline&requestId=${overtimeRequest.id}`,
              },
            },
          ],
        },
      },
    };

    await this.sendNotification(user.id, JSON.stringify(message), 'overtime');
  }

  async sendOvertimeResponseNotification(
    managerId: string,
    employee: User,
    overtimeRequest: OvertimeRequest,
  ): Promise<void> {
    const message = {
      type: 'flex',
      altText: 'Overtime Request Response',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'Overtime Request Response',
              weight: 'bold',
              size: 'xl',
            },
            {
              type: 'text',
              text: `Employee: ${employee.name}`,
            },
            {
              type: 'text',
              text: `Date: ${overtimeRequest.date.toLocaleDateString()}`,
            },
            {
              type: 'text',
              text: `Time: ${overtimeRequest.startTime} - ${overtimeRequest.endTime}`,
            },
            {
              type: 'text',
              text: `Status: ${overtimeRequest.status}`,
              color:
                overtimeRequest.status === 'accepted' ? '#27AE60' : '#E74C3C',
            },
          ],
        },
      },
    };

    await this.sendNotification(managerId, JSON.stringify(message), 'overtime');
  }

  private createRequestFlexMessage(
    user: User,
    request: LeaveRequest | OvertimeRequest,
    requestType: 'leave' | 'overtime',
    requestCount: number,
    admin: User,
  ): FlexMessage {
    const isLeaveRequest = requestType === 'leave';
    const requestTypeText = isLeaveRequest ? 'Leave' : 'Overtime';
    const resubmissionText =
      'resubmitted' in request && request.resubmitted ? ' (ส่งใหม่)' : '';

    return {
      type: 'flex',
      altText: `${requestTypeText} Request Notification${resubmissionText}`,
      contents: {
        type: 'bubble',
        size: 'giga',
        header: {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `${requestTypeText} Request${resubmissionText}`,
                  color: '#000000',
                  size: 'xl',
                  flex: 4,
                  weight: 'bold',
                  align: 'center',
                  gravity: 'center',
                },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [],
              width: '10px',
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `${requestCount}`,
                  align: 'center',
                  gravity: 'center',
                  color: '#FFFFFF',
                  wrap: true,
                  adjustMode: 'shrink-to-fit',
                  weight: 'bold',
                },
              ],
              width: '35px',
              height: '35px',
              cornerRadius: '30px',
              backgroundColor: '#FF1900',
              justifyContent: 'center',
            },
          ],
          paddingAll: '20px',
          backgroundColor: '#F0F0F0',
          spacing: 'md',
          paddingTop: '22px',
          height: '100px',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'image',
                      url: user.profilePictureUrl || '',
                      aspectMode: 'cover',
                      size: 'full',
                    },
                  ],
                  cornerRadius: '100px',
                  width: '72px',
                  height: '72px',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: `${user.name} (${user.nickname})`,
                      weight: 'bold',
                      size: 'sm',
                      wrap: true,
                    },
                    ...(isLeaveRequest
                      ? [
                          {
                            type: 'text',
                            text: `ประเภทการลา: ${(request as LeaveRequest).leaveType}${resubmissionText}`,
                            size: 'sm',
                            wrap: true,
                          },
                          {
                            type: 'text',
                            text: `วันที่: ${new Date(
                              (request as LeaveRequest).startDate,
                            ).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })} - ${new Date(
                              (request as LeaveRequest).endDate,
                            ).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })} (${(request as LeaveRequest).fullDayCount} วัน)`,
                            size: 'sm',
                            wrap: true,
                          },
                        ]
                      : [
                          {
                            type: 'text',
                            text: `วันที่: ${new Date(
                              (request as OvertimeRequest).date,
                            ).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}`,
                            size: 'sm',
                            wrap: true,
                          },
                          {
                            type: 'text',
                            text: `เวลา: ${(request as OvertimeRequest).startTime} - ${(request as OvertimeRequest).endTime}`,
                            size: 'sm',
                            wrap: true,
                          },
                        ]),
                    {
                      type: 'text',
                      text: `สาเหตุ: ${request.reason}`,
                      size: 'sm',
                      wrap: true,
                    },
                    {
                      type: 'text',
                      text: `วันที่ยื่น: ${new Date(
                        request.createdAt,
                      ).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}`,
                      size: 'sm',
                      color: '#4682B4',
                    },
                    ...('resubmitted' in request &&
                    request.resubmitted &&
                    request.originalRequestId
                      ? [
                          {
                            type: 'text',
                            text: `คำขอเดิม: ${request.originalRequestId}`,
                            size: 'sm',
                            color: '#4682B4',
                          },
                        ]
                      : []),
                  ] as FlexComponent[],
                },
              ],
              spacing: 'xl',
              paddingAll: '20px',
            },
          ],
          paddingAll: '0px',
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'อนุมัติ',
                data: `action=approve&requestType=${requestType}&requestId=${request.id}&approverId=${admin.id}`,
              },
              color: '#0662FF',
              style: 'primary',
              adjustMode: 'shrink-to-fit',
            },
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'ไม่อนุมัติ',
                data: `action=deny&requestType=${requestType}&requestId=${request.id}&approverId=${admin.id}`,
              },
              color: '#F0F0F0',
              style: 'secondary',
              adjustMode: 'shrink-to-fit',
              margin: 'lg',
            },
          ],
        },
      },
    };
  }

  private async getAdmins(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        OR: [{ role: 'ADMIN' }, { role: 'SUPERADMIN' }],
      },
    });
  }
}

export function createNotificationService(
  prisma: PrismaClient,
): NotificationService {
  return new NotificationService(prisma);
}

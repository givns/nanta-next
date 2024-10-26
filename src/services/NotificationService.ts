// NotificationService.ts

import { Client, FlexComponent, FlexMessage, Message } from '@line/bot-sdk';
import {
  PrismaClient,
  User,
  LeaveRequest,
  OvertimeRequest,
  ShiftAdjustmentRequest,
} from '@prisma/client';
import { generateApprovalMessageForAdmins } from '../utils/generateApprovalMessage';
import { generateDenialMessageForAdmins } from '../utils/generateDenialMessage';
import { NotificationQueue } from './NotificationQueue';
import { UseMappingService } from './useMappingService';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

export class NotificationService {
  private notificationQueue: NotificationQueue;
  private lineClient: Client;
  private userMappingService: UseMappingService;

  constructor(private prisma: PrismaClient) {
    console.log('Initializing NotificationService');
    this.lineClient = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    });
    this.userMappingService = new UseMappingService();
    this.notificationQueue = new NotificationQueue(
      this.lineClient,
      this.userMappingService,
    );
    console.log('NotificationService initialized');
  }

  async sendNotification(
    employeeId: string,
    lineUserId: string,
    message: string | Message,
    type:
      | 'check-in'
      | 'check-out'
      | 'leave'
      | 'overtime'
      | 'overtime-digest'
      | 'overtime-batch-approval'
      | 'shift',
  ): Promise<boolean> {
    console.log(`Sending ${type} notification to employee ${employeeId}`);
    try {
      let messageToSend: Message;
      if (typeof message === 'string') {
        try {
          messageToSend = JSON.parse(message);
        } catch (error) {
          console.error('Error parsing message:', error);
          throw new Error('Invalid message format: unable to parse JSON');
        }
      } else if (this.isLineMessage(message)) {
        messageToSend = message;
      } else {
        throw new Error('Invalid message format');
      }

      console.log(
        `Sending ${type} notification to LINE User ID: ${lineUserId}`,
      );
      const result = await this.lineClient.pushMessage(
        lineUserId,
        messageToSend,
      );
      console.log(
        `Successfully sent ${type} notification to employee ${employeeId}. Result:`,
        result,
      );
      return true;
    } catch (error) {
      console.error(
        `Error sending notification to employee ${employeeId}:`,
        error,
      );
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return false;
    }
  }

  private isLineMessage(message: any): message is Message {
    return (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      typeof message.type === 'string'
    );
  }

  private async sendLineMessage(
    employeeId: string,
    lineUserId: string,
    message: string,
  ): Promise<void> {
    try {
      if (!lineUserId) {
        console.warn(`No LINE User ID found for employee ${employeeId}`);
        return;
      }
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

  async sendCheckInConfirmation(
    employeeId: string,
    lineUserId: string,
    checkInTime: Date,
  ): Promise<void> {
    const formattedDateTime = format(
      checkInTime,
      'dd MMMM yyyy เวลา HH:mm น.',
      { locale: th },
    );
    const messageText = `${employeeId} ลงเวลาเข้างานเมื่อ ${formattedDateTime}`;
    const message: Message = {
      type: 'text',
      text: messageText,
    };
    console.log('Constructed message:', message);
    await this.sendNotification(employeeId, lineUserId, message, 'check-in');
  }

  async sendCheckOutConfirmation(
    employeeId: string,
    lineUserId: string,
    checkOutTime: Date,
  ): Promise<void> {
    const formattedDateTime = format(
      checkOutTime,
      'dd MMMM yyyy เวลา HH:mm น.',
      { locale: th },
    );
    const messageText = `${employeeId} ลงเวลาออกงานเมื่อ ${formattedDateTime}`;

    const message: Message = {
      type: 'text',
      text: messageText,
    };
    console.log('Constructed message:', message);
    await this.sendNotification(employeeId, lineUserId, message, 'check-in');
  }
  async sendMissingCheckInNotification(
    employeeId: string,
    lineUserId: string,
  ): Promise<void> {
    const message = 'คุณยังไม่ได้ลงเวลาเข้างานวันนี้ กรุณาลงเวลาโดยเร็วที่สุด';
    await this.sendLineMessage(employeeId, lineUserId, message);
  }

  async sendMissingCheckOutNotification(
    employeeId: string,
    lineUserId: string,
  ): Promise<void> {
    const message = 'คุณยังไม่ได้ลงเวลาออกงานวันนี้ กรุณาลงเวลาโดยเร็วที่สุด';
    await this.sendLineMessage(employeeId, lineUserId, message);
  }

  async sendRequestNotification(
    adminEmployeeId: string,
    adminLineUserId: string,
    _requestId: string,
    requestType: 'leave' | 'overtime',
    requester: User,
    request: LeaveRequest | OvertimeRequest,
  ): Promise<void> {
    console.log(
      `Preparing to send ${requestType} request notification to admin: ${adminEmployeeId}`,
    );

    try {
      const requestCount = await this.getRequestCountForAllAdmins();
      console.log(`Total pending requests: ${requestCount}`);

      const message = this.createRequestFlexMessage(
        requester,
        request,
        requestType,
        requestCount,
        { employeeId: adminEmployeeId, lineUserId: adminLineUserId },
      );

      const success = await this.sendNotification(
        adminEmployeeId,
        adminLineUserId,
        JSON.stringify(message),
        requestType,
      );
      if (success) {
        console.log(
          `Successfully sent ${requestType} request notification to admin: ${adminEmployeeId}`,
        );
      } else {
        console.error(
          `Failed to send ${requestType} request notification to admin: ${adminEmployeeId}`,
        );
      }
    } catch (error) {
      console.error(
        `Error sending ${requestType} request notification:`,
        error,
      );
      throw error;
    }
  }

  async sendRequestStatusNotification(
    user: User,
    request: LeaveRequest | OvertimeRequest,
    actionBy: User,
    requestType: 'leave' | 'overtime',
    status: 'approved' | 'denied',
  ): Promise<void> {
    const messageGenerator =
      status === 'approved'
        ? generateApprovalMessageForAdmins
        : generateDenialMessageForAdmins;

    const message = messageGenerator(user, request, actionBy, requestType);

    // Send to the requester
    if (user.lineUserId) {
      await this.sendNotification(
        user.employeeId,
        user.lineUserId,
        JSON.stringify(message),
        requestType,
      );
    } else {
      console.warn(`User ${user.employeeId} does not have a LINE User ID`);
    }

    // Send to all admins
    const admins = await this.getAdmins();
    for (const admin of admins) {
      if (admin.lineUserId) {
        await this.sendNotification(
          admin.employeeId,
          admin.lineUserId,
          JSON.stringify(message),
          requestType,
        );
      } else {
        console.warn(`Admin ${admin.employeeId} does not have a LINE User ID`);
      }
    }
  }

  // Helper method for webhook replies
  async sendRequestStatusNotificationWithReply(
    user: User,
    request: LeaveRequest | OvertimeRequest,
    actionBy: User,
    requestType: 'leave' | 'overtime',
    status: 'approved' | 'denied',
    replyToken?: string,
  ): Promise<void> {
    const messageGenerator =
      status === 'approved'
        ? generateApprovalMessageForAdmins
        : generateDenialMessageForAdmins;

    const message = messageGenerator(user, request, actionBy, requestType);

    // Reply to webhook if replyToken exists
    if (replyToken) {
      await this.lineClient.replyMessage(replyToken, message);
    }

    // Send notifications
    await this.sendRequestStatusNotification(
      user,
      request,
      actionBy,
      requestType,
      status,
    );
  }

  async sendPotentialOvertimeNotification(
    adminId: string,
    adminLineUserId: string,
    employeeId: string,
    date: Date,
    duration: number,
  ): Promise<void> {
    const message = `Employee ${employeeId} has potential overtime of ${duration} minutes on ${format(date, 'yyyy-MM-dd')}. Please review.`;
    await this.sendNotification(adminId, adminLineUserId, message, 'overtime');
  }

  async sendBatchApprovalNotification(
    adminId: string,
    adminLineUserId: string,
    approvedRequests: OvertimeRequest[],
    _type: 'overtime' | 'leave',
  ): Promise<void> {
    const message = this.createBatchApprovalMessage(approvedRequests);
    await this.sendNotification(
      adminId,
      adminLineUserId,
      JSON.stringify(message),
      'overtime-batch-approval',
    );
  }

  private createBatchApprovalMessage(
    approvedRequests: OvertimeRequest[],
  ): FlexMessage {
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
          ],
        },
      },
    };
  }
  async sendOvertimeApprovalNotification(
    employeeId: string,
    lineUserId: string,
    approvedRequest: OvertimeRequest,
    approverId: string,
  ): Promise<void> {
    const message = {
      type: 'text',
      text: `คำขอทำงานล่วงเวลา ${approvedRequest.date.toDateString()} (${approvedRequest.startTime} - ${approvedRequest.endTime}) ได้รับการอนุมัติโดย ${approverId}.`,
    };
    await this.sendNotification(
      employeeId,
      lineUserId,
      JSON.stringify(message),
      'overtime',
    );
  }

  async sendOvertimeResponseNotification(
    employeeId: string,
    lineUserId: string,
    overtimeRequest: OvertimeRequest,
  ): Promise<void> {
    const message = {
      type: 'text',
      text: `Your overtime request for ${overtimeRequest.date.toLocaleDateString()} has been ${overtimeRequest.status}.`,
    };
    await this.sendNotification(
      employeeId,
      lineUserId,
      JSON.stringify(message),
      'overtime',
    );
  }

  async sendOvertimeRequestNotification(
    request: OvertimeRequest,
    employeeId: string,
    lineUserId: string,
  ): Promise<void> {
    const message: FlexMessage = {
      type: 'flex',
      altText: 'มีคำสั่งทำงานล่วงเวลา',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'แจ้งเตือน OT',
              weight: 'bold',
              size: 'xl',
            },
            {
              type: 'text',
              text: 'กรุณาตรวจสอบ และยืนยันคำขอทำงานล่วงเวลา',
            },
            {
              type: 'text',
              text: `วันที่: ${request.date.toLocaleDateString()}`,
            },
            {
              type: 'text',
              text: `เวลา: ${request.startTime} - ${request.endTime}`,
            },
            {
              type: 'text',
              text: `สาเหตุ: ${request.reason}`,
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
                label: 'ทำ OT',
                data: `action=approve&requestId=${request.id}`,
              },
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: 'ไม่ทำ OT',
                data: `action=deny&requestId=${request.id}`,
              },
            },
          ],
        },
      },
    };

    await this.sendNotification(
      employeeId,
      lineUserId,
      JSON.stringify(message),
      'overtime',
    );
  }

  private createRequestFlexMessage(
    user: User,
    request: LeaveRequest | OvertimeRequest,
    requestType: 'leave' | 'overtime',
    requestCount: number,
    admin: { employeeId: string; lineUserId: string },
  ): FlexMessage {
    const isLeaveRequest = requestType === 'leave';
    const requestTypeText = isLeaveRequest ? 'ลางาน' : 'ทำงานล่วงเลา';
    const resubmissionText =
      'resubmitted' in request && request.resubmitted ? ' (ส่งใหม่)' : '';

    return {
      type: 'flex',
      altText: `มีคำขอ ${requestTypeText} รอการอนุมัติ`,
      contents: {
        type: 'bubble',
        size: 'mega',
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
                  text: `แแบฟอร์มขอ${requestTypeText} ${resubmissionText || ''}`,
                  color: '#000000',
                  size: 'xl',
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
          paddingTop: '22px', // Specific top padding
          paddingBottom: '18px', //
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: 'พนักงาน',
                      color: '#aaaaaa',
                      size: 'xs',
                    },
                    {
                      type: 'text',
                      text: user.nickname
                        ? `${user.name} (${user.nickname})`
                        : user.name,
                      color: '#1a1a1a',
                      size: 'sm',
                      wrap: true,
                      weight: 'bold',
                    },
                  ],
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: 'ประเภทการลา',
                      color: '#aaaaaa',
                      size: 'xs',
                    },
                    {
                      type: 'text',
                      text: `${(request as LeaveRequest).leaveType}${resubmissionText || ''}`,
                      color: '#1a1a1a',
                      size: 'sm',
                      wrap: true,
                      weight: 'bold',
                    },
                  ],
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: 'ระยะเวลา',
                      color: '#aaaaaa',
                      size: 'xs',
                    },
                    {
                      type: 'text',
                      text: `${new Date(
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
                      color: '#1a1a1a',
                      size: 'sm',
                      wrap: true,
                    },
                  ],
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: 'เหตุผลการลา',
                      color: '#aaaaaa',
                      size: 'xs',
                    },
                    {
                      type: 'text',
                      text: request.reason || '',
                      color: '#1a1a1a',
                      size: 'sm',
                      wrap: true,
                    },
                  ],
                },
              ],
              paddingAll: '20px',
            },
            {
              type: 'separator',
              color: '#EAEAEA',
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `ยื่นคำขอเมื่อ ${new Date(
                    request.createdAt,
                  ).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}`,
                  color: '#aaaaaa',
                  size: 'xs',
                },
              ],
              paddingAll: '10px',
            },
          ],
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
                data: `action=approve&requestType=${requestType}&requestId=${request.id}&approverId=${admin.employeeId}`,
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
                data: `action=deny&requestType=${requestType}&requestId=${request.id}&approverId=${admin.employeeId}`,
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
    return this.userMappingService.getAdminUsers();
  }

  async getRequestCountForAllAdmins(): Promise<number> {
    console.log('Getting request count for all admins');
    try {
      const now = new Date();
      const currentMonthStart =
        now.getDate() < 26
          ? new Date(now.getFullYear(), now.getMonth() - 1, 26)
          : new Date(now.getFullYear(), now.getMonth(), 26);

      const [leaveRequests] = await Promise.all([
        this.prisma.leaveRequest.count({
          where: {
            createdAt: { gte: currentMonthStart },
          },
        }),
        this.prisma.overtimeRequest.count({
          where: {
            createdAt: { gte: currentMonthStart },
          },
        }),
      ]);

      console.log('Leave requests count:', leaveRequests);

      const totalCount = leaveRequests;
      console.log(`Total pending requests: ${totalCount}`);
      return totalCount;
    } catch (error) {
      console.error('Error getting request count for all admins:', error);
      return 0;
    }
  }
}
export function createNotificationService(
  prisma: PrismaClient,
): NotificationService {
  return new NotificationService(prisma);
}

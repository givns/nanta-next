// NotificationService.ts

import { Client, FlexMessage, Message } from '@line/bot-sdk';
import {
  PrismaClient,
  User,
  LeaveRequest,
  OvertimeRequest,
  LocationAssistanceRequest,
} from '@prisma/client';
import { generateApprovalMessageForAdmins } from '../utils/generateApprovalMessage';
import { generateDenialMessageForAdmins } from '../utils/generateDenialMessage';
import { UseMappingService } from './useMappingService';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

export class NotificationService {
  private lineClient: Client | null = null;
  private userMappingService: UseMappingService;

  constructor(private prisma: PrismaClient) {
    console.log('Initializing NotificationService');

    // Initialize LINE client only if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      try {
        this.lineClient = new Client({
          channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
        });
      } catch (error) {
        console.warn('Failed to initialize LINE client:', error);
      }
    } else {
      console.log('NotificationService initialized in test mode');
    }

    this.userMappingService = new UseMappingService();
  }

  async sendNotification(
    employeeId: string,
    lineUserId: string,
    message: string | Message,
    type:
      | 'attendance'
      | 'check-in'
      | 'check-out'
      | 'leave'
      | 'overtime'
      | 'overtime-digest'
      | 'overtime-batch-approval'
      | 'location-assistance'
      | 'shift',
  ): Promise<boolean> {
    if (!this.lineClient) {
      console.warn('LINE client not initialized. Skipping notification.');
      return false;
    }

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
      await this.lineClient.pushMessage(lineUserId, messageToSend);
      console.log(
        `Successfully sent ${type} notification to employee ${employeeId}`,
      );
      return true;
    } catch (error) {
      console.error(
        `Error sending notification to employee ${employeeId}:`,
        error,
      );
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

  // Update all other methods that use lineClient to handle null case
  private async sendLineMessage(
    employeeId: string,
    lineUserId: string,
    message: string,
  ): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      console.log('Test mode: Would send LINE message:', {
        employeeId,
        lineUserId,
        message,
      });
      return;
    }

    if (!this.lineClient) {
      console.warn('LINE client not initialized. Skipping message.');
      return;
    }

    try {
      await this.lineClient.pushMessage(lineUserId, {
        type: 'text',
        text: message,
      });
      console.log(`Message sent to LINE user ${lineUserId}`);
    } catch (error) {
      console.error('Error sending LINE message:', error);
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

    // Send to all admins except the action taker
    const admins = await this.getAdmins();
    for (const admin of admins) {
      // Skip sending to the admin who took the action to avoid duplicate notification
      if (admin.employeeId === actionBy.employeeId) {
        continue;
      }

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

  async sendRequestStatusNotificationWithReply(
    user: User,
    request: LeaveRequest | OvertimeRequest,
    actionBy: User,
    requestType: 'leave' | 'overtime',
    status: 'approved' | 'denied',
    replyToken?: string,
  ): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      console.log('Test mode: Would send status notification:', {
        user,
        request,
        actionBy,
        requestType,
        status,
        replyToken,
      });
      return;
    }

    if (!this.lineClient) {
      console.warn(
        'LINE client not initialized. Skipping status notification.',
      );
      return;
    }
    const messageGenerator =
      status === 'approved'
        ? generateApprovalMessageForAdmins
        : generateDenialMessageForAdmins;

    const message = messageGenerator(user, request, actionBy, requestType);

    // If we have a replyToken, use it for sending to the action taker
    if (replyToken) {
      // Send immediate reply to the action taker
      await this.lineClient.replyMessage(replyToken, message);
    } else if (actionBy.lineUserId) {
      // If no replyToken but we have lineUserId, send as regular notification
      await this.sendNotification(
        actionBy.employeeId,
        actionBy.lineUserId,
        JSON.stringify(message),
        requestType,
      );
    }

    // Send notifications to user and other admins
    // This will skip the actionBy admin in the admin notification loop
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

  async sendLocationRequest(
    employeeId: string,
    lineUserId: string,
    request: LocationAssistanceRequest,
  ): Promise<boolean> {
    const message: FlexMessage = {
      type: 'flex',
      altText: 'คำขอตรวจสอบตำแหน่ง',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'คำขอตรวจสอบตำแหน่ง',
              weight: 'bold',
              size: 'xl',
            },
          ],
          backgroundColor: '#f3f4f6',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `รหัสพนักงาน: ${request.employeeId}`,
              size: 'sm',
            },
            {
              type: 'text',
              text: request.reason || 'ไม่ระบุเหตุผล',
              wrap: true,
              margin: 'md',
            },
            {
              type: 'text',
              text: `ที่อยู่: ${request.address || 'ไม่ระบุ'}`,
              size: 'sm',
              wrap: true,
              margin: 'md',
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
              action: {
                type: 'postback',
                label: 'อนุมัติ',
                data: `action=approve_location&requestId=${request.id}`,
              },
              style: 'primary',
            },
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'ไม่อนุมัติ',
                data: `action=reject_location&requestId=${request.id}`,
              },
              style: 'secondary',
            },
          ],
        },
      },
    };

    console.log('Sending flex message:', JSON.stringify(message));

    const result = await this.sendNotification(
      employeeId,
      lineUserId,
      JSON.stringify(message),
      'location-assistance',
    );

    console.log('Location request notification result:', result);
    return result;
  }

  async sendLocationVerificationResult(
    employeeId: string,
    lineUserId: string,
    status: 'APPROVED' | 'REJECTED',
    note?: string,
  ): Promise<boolean> {
    const message = {
      type: 'text',
      text:
        status === 'APPROVED'
          ? `✅ ตำแหน่งของคุณได้รับการอนุมัติ${note ? `\nหมายเหตุ: ${note}` : ''}`
          : `❌ ตำแหน่งของคุณไม่ได้รับการอนุมัติ${note ? `\nเหตุผล: ${note}` : ''}\nกรุณาลองใหม่อีกครั้ง`,
    };

    return this.sendNotification(
      employeeId,
      lineUserId,
      JSON.stringify(message),
      'location-assistance',
    );
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

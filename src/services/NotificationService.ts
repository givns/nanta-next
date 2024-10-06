// NotificationService.ts

import { Client, FlexComponent, FlexMessage, Message } from '@line/bot-sdk';
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
import { UserMappingService } from './useMappingService';

export class NotificationService {
  private notificationQueue: NotificationQueue;
  private lineClient: Client;
  private userMappingService: UserMappingService;

  constructor(prisma: PrismaClient) {
    this.lineClient = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    });
    this.userMappingService = new UserMappingService(prisma);
    this.notificationQueue = new NotificationQueue(
      this.lineClient,
      this.userMappingService,
    );
  }

  async sendNotification(
    employeeId: string,
    message: string | Message,
    type:
      | 'check-in'
      | 'check-out'
      | 'leave'
      | 'overtime'
      | 'overtime-digest'
      | 'overtime-batch-approval'
      | 'shift',
  ): Promise<void> {
    await this.notificationQueue.addNotification({ employeeId, message, type });
  }

  async sendCheckInConfirmation(
    employeeId: string,
    checkInTime: Date,
  ): Promise<void> {
    const message = `${employeeId}  ลงเวลาเข้างาน ${format(checkInTime, 'HH:mm')} เรียบร้อยแล้ว`;
    await this.sendNotification(employeeId, message, 'check-in');
  }

  async sendCheckOutConfirmation(
    employeeId: string,
    checkOutTime: Date,
  ): Promise<void> {
    const message = `${employeeId}  ลงเวลาออกงาน ${format(checkOutTime, 'HH:mm')} เรียบร้อยแล้ว`;
    await this.sendNotification(employeeId, message, 'check-out');
  }

  private async sendLineMessage(
    employeeId: string,
    message: string,
  ): Promise<void> {
    try {
      await this.lineClient.pushMessage(employeeId, {
        type: 'text',
        text: message,
      });
      console.log(`Notification sent to LINE user ${employeeId}: ${message}`);
    } catch (error) {
      console.error('Error sending LINE message:', error);
      throw new Error('Failed to send LINE message');
    }
  }

  async sendMissingCheckInNotification(employeeId: string): Promise<void> {
    const message = 'คุณยังไม่ได้ลงเวลาเข้างานวันนี้ กรุณาลงเวลาโดยเร็วที่สุด';
    await this.sendLineMessage(employeeId, message);
  }

  async sendApprovedRequestNotification(
    lineUserId: string,
    requestType: 'leave' | 'overtime',
  ): Promise<void> {
    const message = `คำขอ${requestType === 'leave' ? 'ลา' : 'ทำงานล่วงเวลา'}ของคุณได้รับการอนุมัติแล้ว`;
    await this.sendLineMessage(lineUserId, message);
  }

  async sendRequestNotification(
    adminEmployeeId: string,
    requestId: string,
    requestType: 'leave' | 'overtime',
  ): Promise<void> {
    const admin =
      await this.userMappingService.getUserByEmployeeId(adminEmployeeId);
    if (!admin) {
      console.warn(`Admin with employee ID ${adminEmployeeId} not found`);
      return;
    }

    const request = await this.userMappingService.getRequestById(
      requestId,
      requestType,
    );
    if (!request) {
      console.warn(`${requestType} request with ID ${requestId} not found`);
      return;
    }

    const user = await this.userMappingService.getUserByEmployeeId(
      request.employeeId,
    );
    if (!user) {
      console.warn(`User with employee ID ${request.employeeId} not found`);
      return;
    }

    const requestCount =
      await this.userMappingService.getRequestCountForAllAdmins();
    const message = this.createRequestFlexMessage(
      user,
      request,
      requestType,
      requestCount,
      admin,
    );

    await this.sendNotification(
      adminEmployeeId,
      JSON.stringify(message),
      requestType,
    );
  }

  async sendApprovalNotification(
    employeeId: string,
    requestId: string,
    approverEmployeeId: string,
    requestType: 'leave' | 'overtime',
  ): Promise<void> {
    const user = await this.userMappingService.getUserByEmployeeId(employeeId);
    const approver =
      await this.userMappingService.getUserByEmployeeId(approverEmployeeId);
    const request = await this.userMappingService.getRequestById(
      requestId,
      requestType,
    );

    if (!user || !approver || !request) {
      console.warn('User, approver, or request not found');
      return;
    }

    const message = generateApprovalMessage(user, request, requestType);
    await this.sendNotification(
      employeeId,
      JSON.stringify(message),
      requestType,
    );

    const adminMessage = generateApprovalMessageForAdmins(
      user,
      request,
      approver,
      requestType,
    );
    const admins = await this.getAdmins();
    for (const admin of admins) {
      await this.sendNotification(
        admin.employeeId,
        JSON.stringify(adminMessage),
        requestType,
      );
    }
  }

  async sendDenialInitiationNotification(
    denierEmployeeId: string,
    requestId: string,
    requestType: 'leave' | 'overtime',
  ) {
    const denier =
      await this.userMappingService.getUserByEmployeeId(denierEmployeeId);
    if (!denier || !denier.lineUserId)
      throw new Error('Denier not found or has no LINE User ID');

    const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/deny-reason?requestId=${requestId}&approverId=${denierEmployeeId}&requestType=${requestType}`;
    await this.lineClient.pushMessage(denier.lineUserId, {
      type: 'text',
      text: `กรุณาระบุเหตุผลในการไม่อนุมัติคำขอ${requestType === 'leave' ? 'ลา' : 'ทำงานล่วงเวลา'}: ${liffUrl}`,
    });
  }

  async sendDenialNotification(
    employeeId: string,
    requestId: string,
    denierEmployeeId: string,
    requestType: 'leave' | 'overtime',
    denialReason: string,
  ): Promise<void> {
    const user = await this.userMappingService.getUserByEmployeeId(employeeId);
    const denier =
      await this.userMappingService.getUserByEmployeeId(denierEmployeeId);
    const request = await this.userMappingService.getRequestById(
      requestId,
      requestType,
    );

    if (!user || !denier || !request) {
      console.warn('User, denier, or request not found');
      return;
    }

    const message = generateDenialMessage(
      user,
      request,
      denialReason,
      requestType,
    );
    await this.sendNotification(
      employeeId,
      JSON.stringify(message),
      requestType,
    );

    const adminMessage = generateDenialMessageForAdmins(
      user,
      request,
      denier,
      denialReason,
      requestType,
    );
    const admins = await this.getAdmins();
    for (const admin of admins) {
      await this.sendNotification(
        admin.employeeId,
        JSON.stringify(adminMessage),
        requestType,
      );
    }
  }

  async sendShiftAdjustmentNotification(
    employeeId: string,
    shiftAdjustment: ShiftAdjustmentRequest & {
      requestedShift: { name: string };
    },
  ): Promise<void> {
    const message = `Your shift for ${format(shiftAdjustment.date, 'yyyy-MM-dd')} has been adjusted to ${shiftAdjustment.requestedShift.name}`;
    await this.sendNotification(employeeId, message, 'shift');
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

  async sendOvertimeDigest(
    managerId: string,
    pendingRequests: OvertimeRequest[],
  ): Promise<void> {
    const message = this.createDigestMessage(pendingRequests);
    await this.sendNotification(
      managerId,
      JSON.stringify(message),
      'overtime-digest',
    );
  }

  async sendBatchApprovalNotification(
    adminId: string,
    approvedRequests: OvertimeRequest[],
  ): Promise<void> {
    const message = this.createBatchApprovalMessage(approvedRequests);
    await this.sendNotification(
      adminId,
      JSON.stringify(message),
      'overtime-batch-approval',
    );
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

  async sendOvertimeApprovalNotification(
    overtimeRequest: OvertimeRequest,
    approverEmployeeId: string,
  ): Promise<void> {
    const user = await this.userMappingService.getUserByEmployeeId(
      overtimeRequest.employeeId,
    );
    const approver =
      await this.userMappingService.getUserByEmployeeId(approverEmployeeId);

    if (!user || !approver) {
      console.warn('User or approver not found');
      return;
    }

    const message = `คำขอทำงานล่วงเวลา ${overtimeRequest.date.toDateString()} (${overtimeRequest.startTime} - ${overtimeRequest.endTime}) ได้รับการอนุมิติโดย ${approver.name}.`;
    await this.sendNotification(
      overtimeRequest.employeeId,
      message,
      'overtime',
    );
  }

  async sendOvertimeDenialNotification(
    overtimeRequest: OvertimeRequest,
    denierEmployeeId: string,
  ): Promise<void> {
    const user = await this.userMappingService.getUserByEmployeeId(
      overtimeRequest.employeeId,
    );
    const denier =
      await this.userMappingService.getUserByEmployeeId(denierEmployeeId);

    if (!user || !denier) {
      console.warn('User or denier not found');
      return;
    }

    const message = `คำขอทำงานล่วงเวลา ${overtimeRequest.date.toDateString()} (${overtimeRequest.startTime} - ${overtimeRequest.endTime}) ไม่ได้รับการอนุมิติโดย ${denier.name}.`;
    await this.sendNotification(
      overtimeRequest.employeeId,
      message,
      'overtime',
    );
  }

  async sendOvertimeAutoApprovalNotification(
    overtimeRequest: OvertimeRequest,
  ): Promise<void> {
    const message = `คำขอทำงานล่วงเวลา ${overtimeRequest.date.toDateString()} (${overtimeRequest.startTime} - ${overtimeRequest.endTime}) ได้รับการอนุมิติโดยระบบอัตโนมัติ`;
    await this.sendNotification(
      overtimeRequest.employeeId,
      message,
      'overtime',
    );
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

  async sendOvertimeRequestNotification(requestId: string): Promise<void> {
    const request = await this.userMappingService.getRequestById(
      requestId,
      'overtime',
    );
    if (!request) {
      console.warn(`Request with ID ${requestId} not found`);
      return;
    }

    const user = await this.userMappingService.getUserByEmployeeId(
      request.employeeId,
    );
    if (!user) {
      console.warn(`User with employee ID ${request.employeeId} not found`);
      return;
    }

    const message: FlexMessage = {
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
              text: `Date: ${request.date.toLocaleDateString()}`,
            },
            {
              type: 'text',
              text: `Time: ${request.startTime} - ${request.endTime}`,
            },
            {
              type: 'text',
              text: `Reason: ${request.reason}`,
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
                data: `action=accept&requestId=${request.id}`,
              },
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: 'Decline',
                data: `action=decline&requestId=${request.id}`,
              },
            },
          ],
        },
      },
    };

    await this.sendNotification(request.employeeId, message, 'overtime');
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
    return this.userMappingService.getAdminUsers();
  }
}
export function createNotificationService(
  prisma: PrismaClient,
): NotificationService {
  return new NotificationService(prisma);
}

// NotificationService.ts

import { Client, FlexComponent, FlexMessage } from '@line/bot-sdk';
import {
  PrismaClient,
  User,
  LeaveRequest,
  OvertimeRequest,
  ShiftAdjustmentRequest,
  EmployeeType,
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

export class NotificationService {
  private lineClient: Client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  });
  prisma: any;

  async sendNotification(userId: string, message: string): Promise<void> {
    try {
      console.log(`Starting sendNotification for user ${userId}`);
      const user = await this.prisma.user.findUnique({
        where: { employeeId: userId },
      });
      if (user && user.lineUserId) {
        console.log(
          `Found LINE user ID for user ${userId}: ${user.lineUserId}`,
        );
        await this.sendLineMessage(user.lineUserId, message);
        console.log(`LINE message sent successfully for user ${userId}`);
      } else {
        console.warn(`No LINE user ID found for user ${userId}`);
      }
      console.log(`Completed sendNotification for user ${userId}`);
    } catch (error: any) {
      console.error(`Error in sendNotification for user ${userId}:`, error);
      console.error('Error stack:', error.stack);
    }
  }

  private async sendLineMessage(
    lineUserId: string,
    message: string,
  ): Promise<void> {
    try {
      console.log(`Sending LINE message to user ${lineUserId}`);
      await this.lineClient.pushMessage(lineUserId, {
        type: 'text',
        text: message,
      });
      console.log(`LINE message sent successfully to user ${lineUserId}`);
    } catch (error: any) {
      console.error(`Error sending LINE message to user ${lineUserId}:`, error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  async sendCheckInConfirmation(
    userId: string,
    checkInTime: Date,
  ): Promise<void> {
    console.log(`Starting sendCheckInConfirmation for user ${userId}`);
    const message = `${format(checkInTime, 'HH:mm')}: บันทึกเวลาเข้างานเรียบร้อยแล้ว`;
    await this.sendNotification(userId, message);
    console.log(`Completed sendCheckInConfirmation for user ${userId}`);
  }

  async sendCheckOutConfirmation(
    userId: string,
    checkOutTime: Date,
  ): Promise<void> {
    console.log(`Starting sendCheckOutConfirmation for user ${userId}`);
    const message = `${format(checkOutTime, 'HH:mm')}: บันทึกเวลาออกงานเรียบร้อยแล้ว`;
    await this.sendNotification(userId, message);
    console.log(`Completed sendCheckOutConfirmation for user ${userId}`);
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
    await this.sendNotification(overtimeRequest.employeeId, message);
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
    await this.sendNotification(overtimeRequest.employeeId, message);
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
    await this.sendNotification(userId, message);
  }

  async sendPotentialOvertimeNotification(
    adminId: string,
    employeeId: string,
    date: Date,
    duration: number,
  ): Promise<void> {
    const message = `Employee ${employeeId} has potential overtime of ${duration} minutes on ${format(date, 'yyyy-MM-dd')}. Please review.`;
    await this.sendNotification(adminId, message);
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

export const notificationService = new NotificationService();

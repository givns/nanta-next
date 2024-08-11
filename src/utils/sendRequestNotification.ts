import { Client, FlexMessage, FlexComponent } from '@line/bot-sdk';
import { LeaveRequest, OvertimeRequest, User } from '@prisma/client';
import { UserRole } from '../types/enum';
import prisma from '../lib/prisma';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const getRequestCountForAdmin = async (adminId: string): Promise<number> => {
  const admin = await prisma.user.findUnique({
    where: {
      id: adminId,
    },
  });
  console.log(admin);

  const now = new Date();
  let currentMonthStart: Date;

  if (now.getDate() < 26) {
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 26);
    currentMonthStart = previousMonth;
  } else {
    currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 26);
  }

  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      createdAt: {
        gte: currentMonthStart,
      },
    },
  });

  return leaveRequests.length;
};

export const sendRequestNotification = async (
  admin: User,
  request: LeaveRequest | OvertimeRequest,
  requestType: 'leave' | 'overtime',
) => {
  const requestCount = await getRequestCountForAdmin(admin.id);
  const user = await prisma.user.findUnique({
    where: { id: request.employeeId },
  });

  if (!user) {
    throw new Error(`User with ID ${request.employeeId} not found`);
  }

  const isLeaveRequest = requestType === 'leave';
  const requestTypeText = isLeaveRequest ? 'Leave' : 'Overtime';
  const resubmissionText =
    'resubmitted' in request && request.resubmitted ? ' (ส่งใหม่)' : '';

  const message: FlexMessage = {
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

  if (admin.lineUserId) {
    await client.pushMessage(admin.lineUserId, message);
  }
};

export const notifyAdmins = async (
  request: LeaveRequest | OvertimeRequest,
  requestType: 'leave' | 'overtime',
) => {
  const admins = await prisma.user.findMany({
    where: {
      OR: [
        { role: UserRole.ADMIN as unknown as string },
        { role: UserRole.SUPERADMIN as unknown as string },
      ],
    },
  });

  for (const admin of admins) {
    await sendRequestNotification(admin, request, requestType);
  }
};

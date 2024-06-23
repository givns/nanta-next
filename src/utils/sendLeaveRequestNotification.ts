import { Client, FlexMessage, FlexComponent } from '@line/bot-sdk';
import { LeaveRequest, User } from '@prisma/client';
import prisma from './db';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const getLeaveCountForAdmin = async (adminId: string): Promise<number> => {
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

export const sendLeaveRequestNotification = async (
  admin: User,
  leaveRequest: LeaveRequest,
) => {
  const requestCount = await getLeaveCountForAdmin(admin.id);
  const user = await prisma.user.findUnique({
    where: { id: leaveRequest.userId },
  });

  if (!user) {
    throw new Error(`User with ID ${leaveRequest.userId} not found`);
  }

  const resubmissionText = leaveRequest.resubmitted ? ' (ส่งใหม่)' : '';

  const message: FlexMessage = {
    type: 'flex',
    altText: `Leave Request Notification${resubmissionText}`,
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
                text: `Leave Request${resubmissionText}`,
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
      hero: {
        type: 'box',
        layout: 'vertical',
        contents: [],
        margin: 'none',
        spacing: 'none',
        cornerRadius: 'none',
        justifyContent: 'space-around',
        offsetTop: 'none',
        offsetBottom: 'none',
        alignItems: 'center',
        backgroundColor: '#F0F0F0',
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
                contents: [],
                flex: 1,
              },
            ],
          },
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
                  {
                    type: 'text',
                    text: `ประเภทการลา: ${leaveRequest.leaveType}${resubmissionText}`,
                    size: 'sm',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `วันที่: ${new Date(
                      leaveRequest.startDate,
                    ).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })} - ${new Date(leaveRequest.endDate).toLocaleDateString(
                      'th-TH',
                      {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      },
                    )} (${leaveRequest.fullDayCount} วัน)`,
                    size: 'sm',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `สาเหตุ: ${leaveRequest.reason}`,
                    size: 'sm',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `วันที่ยื่น: ${new Date(
                      leaveRequest.createdAt,
                    ).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}`,
                    size: 'sm',
                    color: '#4682B4',
                  },
                  ...(leaveRequest.resubmitted && leaveRequest.originalRequestId
                    ? [
                        {
                          type: 'text',
                          text: `คำขอเดิม: ${leaveRequest.originalRequestId}`,
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
              data: `action=approve&requestId=${leaveRequest.id}&approverId=${admin.id}`,
            },
            color: '#00FF7F',
            style: 'secondary',
            adjustMode: 'shrink-to-fit',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'ไม่อนุมัติ',
              data: `action=deny&requestId=${leaveRequest.id}&approverId=${admin.id}`,
            },
            color: '#F0F0F0',
            style: 'secondary',
            adjustMode: 'shrink-to-fit',
            margin: 'lg',
          },
        ],
      },
      styles: {
        hero: {
          backgroundColor: '#FFFFFF',
        },
      },
    },
  };

  await client.pushMessage(admin.lineUserId, message);
};

export const notifyAdmins = async (leaveRequest: LeaveRequest) => {
  const admins = await prisma.user.findMany({
    where: {
      OR: [{ role: 'admin' }, { role: 'superadmin' }],
    },
  });

  for (const admin of admins) {
    await sendLeaveRequestNotification(admin, leaveRequest);
  }
};

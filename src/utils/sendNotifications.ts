import { Client, FlexMessage } from '@line/bot-sdk';
import { LeaveRequest, User } from '@prisma/client';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export const sendLeaveRequestNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
) => {
  const message: FlexMessage = {
    type: 'flex',
    altText: 'Leave Request Notification',
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: 'Leave Request',
                color: '#000000',
                align: 'start',
                size: 'xl',
                weight: 'bold',
              },
            ],
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: [],
            backgroundColor: '#F0F0F0',
          },
        ],
        backgroundColor: '#F0F0F0',
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
                    text: `ประเภทการลา: ${leaveRequest.leaveType}`,
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
                    )} (${Math.ceil((new Date(leaveRequest.endDate).getTime() - new Date(leaveRequest.startDate).getTime()) / (1000 * 60 * 60 * 24))} วัน)`,
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
                ],
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
              data: `action=approve&requestId=${leaveRequest.id}`,
            },
            color: '#00FF7F',
            style: 'secondary',
            adjustMode: 'shrink-to-fit',
          },
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'ไม่อนุมัติ',
              uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}?path=/deny-reason&requestId=${leaveRequest.id}`,
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

  await client.pushMessage(user.lineUserId, message);
};

export const sendApproveNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
) => {
  const message: FlexMessage = {
    type: 'flex',
    altText: 'Leave Request Approved',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'คำขอการลาของคุณได้รับอนุมัติแล้ว',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#00FF7F',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'ประเภทการลา',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: leaveRequest.leaveType,
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'วันที่',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: `${new Date(leaveRequest.startDate).toLocaleDateString(
                  'th-TH',
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  },
                )} - ${new Date(leaveRequest.endDate).toLocaleDateString(
                  'th-TH',
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  },
                )} (${Math.ceil(
                  (new Date(leaveRequest.endDate).getTime() -
                    new Date(leaveRequest.startDate).getTime()) /
                    (1000 * 60 * 60 * 24),
                )} วัน)`,
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'สาเหตุ',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: leaveRequest.reason,
                wrap: true,
                flex: 1,
              },
            ],
          },
        ],
      },
    },
  };

  await client.pushMessage(user.lineUserId, message);
};

export const sendDenyNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
  denialReason: string,
) => {
  const message: FlexMessage = {
    type: 'flex',
    altText: 'Leave Request Denied',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'คำขอการลาถูกปฏิเสธ',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#FF0000',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'ประเภทการลา',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: leaveRequest.leaveType,
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'วันที่',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: `${new Date(leaveRequest.startDate).toLocaleDateString(
                  'th-TH',
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  },
                )} - ${new Date(leaveRequest.endDate).toLocaleDateString(
                  'th-TH',
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  },
                )} (${Math.ceil(
                  (new Date(leaveRequest.endDate).getTime() -
                    new Date(leaveRequest.startDate).getTime()) /
                    (1000 * 60 * 60 * 24),
                )} วัน)`,
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'สาเหตุ',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: leaveRequest.reason,
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'เหตุผลที่ถูกปฏิเสธ',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: denialReason,
                wrap: true,
                flex: 1,
              },
            ],
          },
        ],
      },
    },
  };

  await client.pushMessage(user.lineUserId, message);
};

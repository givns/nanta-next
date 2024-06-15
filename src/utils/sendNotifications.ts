import { Client, FlexMessage } from '@line/bot-sdk';
import { LeaveRequest, User } from '@prisma/client';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

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
                    (1000 * 3600 * 24) +
                    1,
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
            color: '#bcbcbc',
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
              type: 'uri',
              label: 'อนุมัติ',
              uri: 'http://linecorp.com/',
            },
            color: '#4C72F1',
            style: 'primary',
          },
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'ไม่อนุมัติ',
              uri: 'http://linecorp.com/',
            },
            color: '#DEEDFF',
            style: 'secondary',
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

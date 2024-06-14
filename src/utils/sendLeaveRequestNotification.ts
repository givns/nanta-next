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
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'คำขอการลาของคุณ',
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
                text: `${new Date(leaveRequest.startDate).toISOString().split('T')[0]} - ${new Date(leaveRequest.endDate).toISOString().split('T')[0]}`,
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
      footer: {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#FF0000',
            action: {
              type: 'postback',
              label: 'ไม่อนุมัติ',
              data: `action=deny&requestId=${leaveRequest.id}`,
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: '#00FF00',
            action: {
              type: 'postback',
              label: 'อนุมัติ',
              data: `action=approve&requestId=${leaveRequest.id}`,
            },
          },
        ],
      },
    },
  };

  await client.pushMessage(user.lineUserId, message);
};

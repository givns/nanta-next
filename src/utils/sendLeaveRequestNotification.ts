import { Client, FlexMessage } from '@line/bot-sdk';
import { LeaveRequest, User } from '@prisma/client';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export const sendLeaveRequestNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
) => {
  const profilePictureUrl =
    user.profilePictureUrl || 'https://example.com/default-profile-picture.png'; // Default image URL
  const message: FlexMessage = {
    type: 'flex',
    altText: 'Leave Request Notification',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'image',
            url: profilePictureUrl,
            size: 'md',
            aspectMode: 'cover',
            aspectRatio: '1:1',
          },
          {
            type: 'text',
            text: `${user.name} ขออนุญาตลางาน คุณอนุมัติหรือไม่?`,
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
            wrap: true,
          },
        ],
        backgroundColor: '#62ad73', // Adobe RGB R98 G173 B115
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
                text: 'รูปแบบวันลา',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: leaveRequest.leaveFormat,
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
                text: `${new Date(leaveRequest.startDate).toLocaleDateString()} - ${new Date(leaveRequest.endDate).toLocaleDateString()}`,
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
            color: '#596fdd',
            action: {
              type: 'postback',
              label: 'ไม่อนุมัติ',
              data: `action=deny&requestId=${leaveRequest.id}`,
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: '#e2ecfe',
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

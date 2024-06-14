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
            text: `${user.name} ขออนุญาตลางาน คุณอนุมัติหรือไม่?`,
            weight: 'bold',
            size: 'xl',
            color: '#FFFFFF',
          },
        ],
        backgroundColor: '#1DB446', // green header background
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
                type: 'image',
                url: 'https://via.placeholder.com/150',
                size: 'sm',
                aspectMode: 'cover',
                aspectRatio: '1:1',
                margin: 'md',
              },
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: user.name,
                    weight: 'bold',
                    size: 'md',
                    margin: 'md',
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    margin: 'md',
                    spacing: 'xs',
                    contents: [
                      {
                        type: 'box',
                        layout: 'baseline',
                        contents: [
                          {
                            type: 'text',
                            text: 'ประเภทการลา',
                            weight: 'bold',
                            size: 'sm',
                            color: '#AAAAAA', // matching text color
                            flex: 0,
                          },
                          {
                            type: 'text',
                            text: leaveRequest.leaveType,
                            wrap: true,
                            size: 'sm',
                            color: '#666666', // matching text color
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
                            size: 'sm',
                            color: '#AAAAAA', // matching text color
                            flex: 0,
                          },
                          {
                            type: 'text',
                            text: leaveRequest.leaveFormat,
                            wrap: true,
                            size: 'sm',
                            color: '#666666', // matching text color
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
                            size: 'sm',
                            color: '#AAAAAA', // matching text color
                            flex: 0,
                          },
                          {
                            type: 'text',
                            text: `${new Date(leaveRequest.startDate).toLocaleDateString()} - ${new Date(leaveRequest.endDate).toLocaleDateString()}`,
                            wrap: true,
                            size: 'sm',
                            color: '#666666', // matching text color
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
                            size: 'sm',
                            color: '#AAAAAA', // matching text color
                            flex: 0,
                          },
                          {
                            type: 'text',
                            text: leaveRequest.reason,
                            wrap: true,
                            size: 'sm',
                            color: '#666666', // matching text color
                            flex: 1,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            spacing: 'sm',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            color: '#AAAAFF', // matching button color for denial
            action: {
              type: 'postback',
              label: 'ไม่อนุมัติ',
              data: `action=deny&requestId=${leaveRequest.id}`,
            },
          },
          {
            type: 'button',
            style: 'secondary',
            color: '#AAAAFF', // matching button color for approval
            action: {
              type: 'postback',
              label: 'อนุมัติ',
              data: `action=approve&requestId=${leaveRequest.id}`,
            },
          },
        ],
        spacing: 'md',
      },
    },
  };

  await client.pushMessage(user.lineUserId, message);
};

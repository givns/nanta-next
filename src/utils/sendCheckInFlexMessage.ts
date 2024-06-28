import { sendFlexMessage } from './lineSdkWrapper';
import { CheckIn } from '@prisma/client';

const checkInTime = new Date().toLocaleTimeString('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
});

export const sendCheckInFlexMessage = async (
  user: {
    id: string;
    lineUserId: string;
    name: string;
    nickname: string;
    department: string;
    employeeNumber: string | null;
    profilePictureUrl: string | null;
    createdAt: Date;
  },
  checkIn: CheckIn,
) => {
  console.log(checkIn);

  const flexMessage = {
    type: 'flex',
    altText: 'Check-In Notification',
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
                text: 'Check-In Notification',
                color: '#000000',
                size: 'xl',
                flex: 4,
                weight: 'bold',
                align: 'center',
                gravity: 'center',
              },
            ],
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
                    url:
                      user.profilePictureUrl ||
                      'https://example.com/default-profile.jpg',
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
                    size: 'md',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: user.department,
                    size: 'sm',
                    color: '#999999',
                  },
                  {
                    type: 'text',
                    text: `Check-In Time: ${checkInTime}`,
                    size: 'sm',
                    color: '#4682B4',
                    margin: 'md',
                  },
                ],
                paddingStart: '20px',
              },
            ],
            spacing: 'xl',
            paddingAll: '20px',
          },
        ],
        paddingAll: '0px',
      },
      styles: {
        body: {
          backgroundColor: '#FFFFFF',
        },
      },
    },
  };

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('LINE Channel Access Token is not set');
  }

  try {
    await sendFlexMessage(token, user.lineUserId, flexMessage);
    console.log('Flex message sent successfully');
  } catch (error) {
    console.error('Error sending flex message:', error);
    throw error;
  }
};

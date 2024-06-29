import axios from 'axios';

export interface UserData {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeNumber: string | null;
  profilePictureUrl: string | null;
  createdAt: Date;
}

export interface CheckIn {
  id: string;
  checkInTime: Date;
  checkOutTime?: Date;
  address: string;
  reason?: string;
  checkOutAddress?: string;
  checkOutReason?: string;
}

const sendFlexMessage = async (
  user: UserData,
  checkIn: CheckIn,
  isCheckIn: boolean,
) => {
  console.log('Preparing to send flex message');
  console.log('User data:', JSON.stringify(user, null, 2));
  console.log('Check-in data:', JSON.stringify(checkIn, null, 2));
  console.log('Is check-in:', isCheckIn);

  const actionTime = isCheckIn
    ? new Date(checkIn.checkInTime).toLocaleTimeString()
    : new Date(checkIn.checkOutTime!).toLocaleTimeString();

  const flexMessage = {
    type: 'flex',
    altText: `${isCheckIn ? 'Check-In' : 'Check-Out'} Notification`,
    contents: {
      type: 'bubble',
      size: 'mega',
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
                text: `${isCheckIn ? 'Check-In' : 'Check-Out'} Notification`,
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
        backgroundColor: isCheckIn ? '#F0F0F0' : '#FFE4E1',
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
                    text: `${user.name} (${user.nickname || ''})`,
                    weight: 'bold',
                    size: 'md',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: user.department || '',
                    size: 'sm',
                    color: '#999999',
                  },
                  {
                    type: 'text',
                    text: `${isCheckIn ? 'Check-In' : 'Check-Out'} Time: ${actionTime}`,
                    size: 'sm',
                    color: isCheckIn ? '#4682B4' : '#B22222',
                    margin: 'md',
                  },
                ],
                paddingStart: '20px',
              },
            ],
            spacing: 'xl',
            paddingAll: '20px',
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: `Address: ${isCheckIn ? checkIn.address : checkIn.checkOutAddress || ''}`,
                size: 'sm',
                wrap: true,
              },
              {
                type: 'text',
                text: `Reason: ${isCheckIn ? checkIn.reason || '' : checkIn.checkOutReason || ''}`,
                size: 'sm',
                wrap: true,
                margin: 'md',
              },
            ],
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

  console.log('Flex message to be sent:', JSON.stringify(flexMessage, null, 2));

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('LINE Channel Access Token is not set');
    throw new Error('LINE Channel Access Token is not set');
  }

  try {
    const response = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: user.lineUserId,
        messages: [flexMessage],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    console.log('LINE API response:', response.data);
    console.log(
      `${isCheckIn ? 'Check-In' : 'Check-Out'} flex message sent successfully`,
    );
  } catch (error: any) {
    console.error(
      `Error sending ${isCheckIn ? 'check-in' : 'check-out'} flex message:`,
      error.response?.data || error.message,
    );
    console.error('Full error object:', JSON.stringify(error, null, 2));
    throw error;
  }
};

export const sendCheckInFlexMessage = async (
  user: UserData,
  checkIn: CheckIn,
) => {
  try {
    await sendFlexMessage(user, checkIn, true);
  } catch (error) {
    console.error('Error in sendCheckInFlexMessage:', error);
    throw new Error('Failed to send check-in notification');
  }
};

export const sendCheckOutFlexMessage = async (
  user: UserData,
  checkIn: CheckIn,
) => {
  try {
    await sendFlexMessage(user, checkIn, false);
  } catch (error) {
    console.error('Error in sendCheckOutFlexMessage:', error);
    throw new Error('Failed to send check-out notification');
  }
};

export { sendFlexMessage };

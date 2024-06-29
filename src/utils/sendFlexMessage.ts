import axios from 'axios';
import { UserData, CheckIn } from '../types/user'; // Adjust the import path as needed

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
    : checkIn.checkOutTime
      ? new Date(checkIn.checkOutTime).toLocaleTimeString()
      : 'N/A';

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

  try {
    const response = await axios.post(
      '/api/send-line-message',
      {
        to: user.lineUserId,
        messages: [flexMessage],
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
    console.log(
      `${isCheckIn ? 'Check-In' : 'Check-Out'} flex message sent successfully`,
    );
    return response.data;
  } catch (error) {
    console.error(
      `Error sending ${isCheckIn ? 'check-in' : 'check-out'} flex message:`,
      error,
    );
    throw error;
  }
};

export const sendCheckInFlexMessage = async (
  user: UserData,
  checkIn: CheckIn,
) => {
  return sendFlexMessage(user, checkIn, true);
};

export const sendCheckOutFlexMessage = async (
  user: UserData,
  checkIn: CheckIn,
) => {
  return sendFlexMessage(user, checkIn, false);
};

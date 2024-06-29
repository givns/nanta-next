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
  _id: string;
  userId: string;
  checkInTime: string | Date;
  location: any; // You might want to define a more specific type for this
  address: string;
  reason: string;
  photo: string;
  createdAt: string | Date;
  checkOutTime?: string | Date;
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
        // ... (keep the header as it is)
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

  // ... (keep the rest of the function as it is)
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

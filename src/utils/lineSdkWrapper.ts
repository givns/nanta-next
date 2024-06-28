import axios from 'axios';

export async function sendFlexMessage(token: string, to: string, content: any) {
  try {
    const response = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: to,
        messages: [
          {
            type: 'flex',
            altText: 'Flex Message',
            contents: content,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error('Error sending Flex message:', error);
    throw error;
  }
}

// services/lineService.ts
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export const sendLineMessage = async (userId: string, message: string) => {
  try {
    await client.pushMessage(userId, { type: 'text', text: message });
  } catch (error) {
    console.error('Error sending LINE message:', error);
  }
};

export default client;

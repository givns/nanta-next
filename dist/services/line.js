import { Client } from '@line/bot-sdk';
const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});
export default client;

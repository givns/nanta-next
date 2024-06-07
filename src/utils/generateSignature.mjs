import { createHmac } from 'crypto';

// Your LINE Channel Secret
const channelSecret = 'YOUR_LINE_CHANNEL_SECRET';

// The raw body of the request you want to test
const rawBody = JSON.stringify({
  destination: "xxxxxxxxxx",
  events: [
    {
      type: "follow",
      timestamp: 1625665242214,
      source: {
        type: "user",
        userId: "Ufc729a925b3abef..."
      },
      replyToken: "bb173f4d9cf64aed9d408ab4e36339ad",
      mode: "active",
      webhookEventId: "01FZ74ASS536FW97EX38NKCZQK",
      deliveryContext: {
        isRedelivery: false
      }
    }
  ]
});

// Generate the HMAC using the channel secret and raw body
const hmac = createHmac('sha256', channelSecret);
hmac.update(rawBody);
const signature = hmac.digest('base64');

console.log('Generated x-line-signature:', signature);
import crypto from 'crypto';

const generateSignature = (channelSecret: string, body: string) => {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(Buffer.from(body, 'utf8'))
    .digest('base64');
  return hash;
};

// Example usage
const channelSecret = process.env.LINE_CHANNEL_SECRET || ''; // Your channel secret
const requestBody = JSON.stringify(
  {
    destination: 'Uc4b94d29a1266cb517af98810279c82a',
    events: [
      {
        type: 'unfollow',
        source: {
          userId: 'U563f8fee79a3846e0a0b116530bca5f0',
          type: 'user',
        },
      },
    ],
  },
  null,
  0,
); // Use null and 0 to ensure no extra spaces are added

// Generate the signature
const signature = generateSignature(channelSecret, requestBody);
console.log('Generated Signature:', signature);

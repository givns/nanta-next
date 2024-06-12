import crypto from 'crypto';

// Function to generate the x-line-signature
const generateSignature = (channelSecret: string, body: string) => {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash;
};

// Example usage
const channelSecret = process.env.LINE_CHANNEL_SECRET || ''; // Your channel secret
const requestBody = JSON.stringify({
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
});

// Generate the signature
const signature = generateSignature(channelSecret, requestBody);
console.log('Generated Signature:', signature);

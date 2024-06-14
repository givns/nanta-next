import { NextApiRequest, NextApiResponse } from 'next';
import { WebhookEvent, Client, ClientConfig } from '@line/bot-sdk';
import dotenv from 'dotenv';
import getRawBody from 'raw-body';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: './.env.local' });

const prisma = new PrismaClient();

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

if (!channelSecret || !channelAccessToken) {
  throw new Error(
    'LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN must be defined in .env.local',
  );
}

// LINE bot client configuration
const clientConfig: ClientConfig = {
  channelAccessToken,
};

const client = new Client(clientConfig);

export const config = {
  api: {
    bodyParser: false, // Disallow body parsing to handle raw body manually
  },
};

const handler = async (event: WebhookEvent) => {
  if (!event) {
    console.error('Event is undefined');
    return;
  }

  console.log('Event received:', event);

  if (event.type === 'follow') {
    // Your existing follow event handling logic
  } else if (event.type === 'postback') {
    const data = event.postback.data;
    const userId = event.source.userId;

    const params = new URLSearchParams(data);
    const action = params.get('action');
    const requestId = params.get('requestId');

    if (action && requestId && userId) {
      if (action === 'approve') {
        // Call your approve handler
        await handleApprove(requestId, userId);
      } else if (action === 'deny') {
        // Call your deny handler
        await handleDeny(requestId, userId);
      }
    }
  } else if (event.type === 'unfollow') {
    // Do nothing for unfollow events
    console.log('Unfollow event for user ID:', event.source.userId);
  } else {
    console.error('Unhandled event type:', event.type);
  }
};

const handleApprove = async (requestId: string, userId: string) => {
  try {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'approved', approverId: userId },
    });
    console.log('Leave request approved:', leaveRequest);

    // Notify the user who requested the leave
    await client.pushMessage(leaveRequest.userId, {
      type: 'text',
      text: 'Your leave request has been approved!',
    });
  } catch (error: any) {
    console.error('Error approving leave request:', error.message);
  }
};

const handleDeny = async (requestId: string, userId: string) => {
  try {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'denied', approverId: userId },
    });
    console.log('Leave request denied:', leaveRequest);

    // Notify the user who requested the leave
    await client.pushMessage(leaveRequest.userId, {
      type: 'text',
      text: 'Your leave request has been denied.',
    });
  } catch (error: any) {
    console.error('Error denying leave request:', error.message);
  }
};

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    // Handle the GET request from the LINE Developer Console
    return res.status(200).send('Webhook is set up and running!');
  }

  if (req.method === 'POST') {
    try {
      const rawBodyBuffer = await getRawBody(req, {
        length: req.headers['content-length'],
        limit: '1mb',
      });

      const rawBody = rawBodyBuffer.toString('utf-8');
      console.log('Raw body:', rawBody);

      req.body = JSON.parse(rawBody);

      if (!req.body.events || !Array.isArray(req.body.events)) {
        console.error('No events found in request body:', req.body);
        return res.status(400).send('No events found');
      }

      const event = req.body.events[0];
      await handler(event);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Error in middleware:', err);
      return res.status(500).send('Internal Server Error');
    }
  }

  // Return a 405 status for any method other than GET or POST
  return res.status(405).send('Method Not Allowed');
};

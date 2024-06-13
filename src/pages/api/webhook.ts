import { NextApiRequest, NextApiResponse } from 'next';
import {
  middleware,
  MiddlewareConfig,
  WebhookEvent,
  Client,
  ClientConfig,
} from '@line/bot-sdk';
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

// Middleware configuration
const middlewareConfig: MiddlewareConfig = {
  channelSecret,
};

export const config = {
  api: {
    bodyParser: false, // Disallow body parsing to handle raw body manually
  },
};

const registerRichMenuId = 'richmenu-6cd71bd9b07545009f7b56d105e0f5a2';
const specialRichMenuId = 'richmenu-3670f2aed131fea8ca22d349188f12ee';
const generalRichMenuId = 'richmenu-0ba7f3459e24877a48eeae1fc946f38b';

const handler = async (event: WebhookEvent) => {
  if (!event) {
    console.error('Event is undefined');
    return;
  }

  console.log('Event received:', JSON.stringify(event, null, 2));

  if (event.type === 'follow') {
    const userId = event.source.userId;
    console.log('Follow event for user ID:', userId);

    if (userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { lineUserId: userId },
        });
        console.log('User lookup result:', user);

        if (!user) {
          await client.linkRichMenuToUser(userId, registerRichMenuId);
          console.log('Register Rich menu linked to user:', userId);
        } else {
          const department = user.department;
          const richMenuId =
            department === 'ฝ่ายขนส่ง' || department === 'ฝ่ายปฏิบัติการ'
              ? specialRichMenuId
              : generalRichMenuId;
          await client.linkRichMenuToUser(userId, richMenuId);
          console.log(`Rich menu linked to user ${userId}: ${richMenuId}`);
        }
      } catch (error: any) {
        console.error(
          'Error processing follow event:',
          error.message,
          error.stack,
        );
      }
    } else {
      console.error('User ID not found in event:', event);
    }
  } else if (event.type === 'unfollow') {
    // Do nothing for unfollow events
    console.log('Unfollow event for user ID:', event.source.userId);
  } else {
    console.error('Unhandled event type:', event.type);
  }
};

const lineMiddleware = middleware(middlewareConfig);

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    // Handle the GET request from the LINE Developer Console for
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

      for (const event of req.body.events) {
        await handler(event);
      }

      return res.status(200).send('OK');
    } catch (err) {
      console.error('Error in middleware:', err);
      return res.status(500).send('Internal Server Error');
    }
  }

  // Return a 405 status for any method other than GET or POST
  return res.status(405).send('Method Not Allowed');
};

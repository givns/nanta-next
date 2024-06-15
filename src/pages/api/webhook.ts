import { NextApiRequest, NextApiResponse } from 'next';
import { WebhookEvent, Client, ClientConfig } from '@line/bot-sdk';
import dotenv from 'dotenv';
import getRawBody from 'raw-body';
import { PrismaClient } from '@prisma/client';
import { handleApprove, handleDeny } from '../../utils/leaveRequestHandlers';
import { sendDenyNotification } from '../../utils/sendNotifications';

dotenv.config({ path: './.env.local' });

const prisma = new PrismaClient();

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

if (!channelSecret || !channelAccessToken) {
  throw new Error(
    'LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN must be defined in .env.local',
  );
}

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
    const userId = event.source.userId;
    console.log('Follow event for user ID:', userId);

    if (userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { lineUserId: userId },
        });
        console.log('User lookup result:', user);

        if (!user) {
          const registerRichMenuId =
            'richmenu-1d20c92a5e0ca5c5c12cc4cb6fda1caa';
          await client.linkRichMenuToUser(userId, registerRichMenuId);
          console.log('Register Rich menu linked to user:', userId);
        } else {
          const department = user.department;
          const richMenuId = await createAndAssignRichMenu(
            department,
            userId,
            user.role,
          );
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
  } else if (event.type === 'postback') {
    const data = event.postback.data;
    const userId = event.source.userId;

    const params = new URLSearchParams(data);
    const action = params.get('action');
    const requestId = params.get('requestId');
    const denialReason = params.get('denialReason');

    if (action && requestId && userId) {
      if (action === 'approve') {
        await handleApprove(requestId, userId);
      } else if (action === 'deny') {
        await handleDeny(requestId, userId, denialReason);
      }
    }
  } else if (event.type === 'unfollow') {
    console.log('Unfollow event for user ID:', event.source.userId);
  } else {
    console.error('Unhandled event type:', event.type);
  }
};

const createAndAssignRichMenu = async (
  department: string,
  userId: string,
  role: string,
) => {
  let richMenuId;
  if (role === 'superadmin') {
    richMenuId = 'richmenu-5610259c0139fc6a9d6475b628986fcf';
  } else if (role === 'admin') {
    richMenuId = 'richmenu-2e10f099c17149de5386d2cf6f936051';
  } else if (['ฝ่ายขนส่ง', 'ฝ่ายปฏิบัติการ'].includes(department)) {
    richMenuId = 'richmenu-d07da0e5fa90760bc50f7b2deec89ca2';
  } else {
    richMenuId = 'richmenu-581e59c118fd514a45fc01d6f301138e';
  }

  await client.linkRichMenuToUser(userId, richMenuId);
  return richMenuId;
};

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
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

  return res.status(405).send('Method Not Allowed');
};

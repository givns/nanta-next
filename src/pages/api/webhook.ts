import { NextApiRequest, NextApiResponse } from 'next';
import { WebhookEvent, Client, ClientConfig } from '@line/bot-sdk';
import dotenv from 'dotenv';
import getRawBody from 'raw-body';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../types/enum';
import { handleApprove, handleDeny } from '../../utils/leaveRequestHandlers';

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
            'richmenu-7f6cc44cf3643bec7374eaeb449c6c71';
          await client.linkRichMenuToUser(userId, registerRichMenuId);
          console.log('Register Rich menu linked to user:', userId);
        } else {
          const department = user.departmentId;
          if (department !== null) {
            const richMenuId = await createAndAssignRichMenu(
              department,
              userId,
              user.role as UserRole,
            );
            console.log(`Rich menu linked to user ${userId}: ${richMenuId}`);
          }
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

    if (action && requestId && userId) {
      try {
        const leaveRequest = await prisma.leaveRequest.findUnique({
          where: { id: requestId },
        });

        if (action === 'approve' && leaveRequest?.status === 'Pending') {
          await handleApprove(requestId, userId);
        } else if (action === 'deny' && leaveRequest?.status === 'Pending') {
          await handleDeny(requestId, userId);
        } else {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'คำขอลานี้ได้รับการดำเนินการแล้ว',
          });
        }
      } catch (error) {
        console.error('Error processing postback action:', error);
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'เกิดข้อผิดพลาดในการดำเนินการ โปรดลองอีกครั้งในภายหลัง',
        });
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
  role: UserRole,
) => {
  let richMenuId;
  switch (role) {
    case UserRole.SUPERADMIN:
      richMenuId = 'richmenu-5e2677dc4e68d4fde747ff413a88264f'; // Super Admin Rich Menu
      break;
    case UserRole.ADMIN:
      richMenuId = 'richmenu-deec36bf2265338a9f48acd024ce1cde'; // Admin Rich Menu
      break;
    case UserRole.DRIVER:
      richMenuId = 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce'; // Placeholder for Route Rich Menu
      break;
    case UserRole.OPERATION:
      richMenuId = 'richmenu-834c002dbe1ccfbedb54a76b6c78bdde'; // Special User Rich Menu
      break;
    case UserRole.GENERAL:
    default:
      richMenuId = 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce'; // General User Rich Menu
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

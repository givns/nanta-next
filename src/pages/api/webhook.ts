// pages/api/webhook.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  WebhookEvent,
  Client,
  ClientConfig,
  validateSignature,
} from '@line/bot-sdk';
import dotenv from 'dotenv';
import getRawBody from 'raw-body';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../types/enum';
import {
  handleApprove,
  handleDeny,
  RequestType,
} from '../../utils/requestHandlers';
import { createAndAssignRichMenu } from '../../utils/richMenuUtils';

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
    bodyParser: false,
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
    const requestType = params.get('requestType') as RequestType;
    const requestId = params.get('requestId');

    if (action && requestType && requestId && userId) {
      try {
        let request;
        if (requestType === 'leave') {
          request = await prisma.leaveRequest.findUnique({
            where: { id: requestId },
          });
        } else if (requestType === 'overtime') {
          request = await prisma.overtimeRequest.findUnique({
            where: { id: requestId },
          });
        }

        if (action === 'approve' && request?.status === 'pending') {
          await handleApprove(requestId, userId, requestType);
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `${requestType === 'leave' ? 'คำขอลา' : 'คำขอทำงานล่วงเวลา'}ได้รับการอนุมัติแล้ว`,
          });
        } else if (action === 'deny' && request?.status === 'pending') {
          await handleDeny(requestId, userId, requestType);
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `${requestType === 'leave' ? 'คำขอลา' : 'คำขอทำงานล่วงเวลา'}ถูกปฏิเสธ กรุณาระบุเหตุผลในการปฏิเสธ`,
          });
        } else {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `${requestType === 'leave' ? 'คำขอลา' : 'คำขอทำงานล่วงเวลา'}นี้ได้รับการดำเนินการแล้ว`,
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

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const signature = req.headers['x-line-signature'] as string;

    try {
      const rawBodyBuffer = await getRawBody(req, {
        length: req.headers['content-length'],
        limit: '1mb',
      });

      const rawBody = rawBodyBuffer.toString('utf-8');

      if (!validateSignature(rawBody, channelSecret, signature)) {
        console.error('Invalid signature');
        return res.status(401).send('Invalid signature');
      }

      const body = JSON.parse(rawBody);

      if (!body.events || !Array.isArray(body.events)) {
        console.error('No events found in request body:', body);
        return res.status(200).send('No events found');
      }

      for (const event of body.events) {
        await handler(event);
      }

      return res.status(200).send('OK');
    } catch (err) {
      console.error('Error in webhook:', err);
      return res.status(500).send('Internal Server Error');
    }
  } else if (req.method === 'GET') {
    return res.status(200).send('Webhook is set up and running!');
  } else {
    return res.status(405).send('Method Not Allowed');
  }
};

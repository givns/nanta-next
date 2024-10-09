import type { NextApiRequest, NextApiResponse } from 'next';
import { WebhookEvent, Client, ClientConfig } from '@line/bot-sdk';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../types/enum';
import { createAndAssignRichMenu } from '../../utils/richMenuUtils';
import getRawBody from 'raw-body';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { TimeEntryService } from '@/services/TimeEntryService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';

dotenv.config({ path: './.env.local' });

const prisma = new PrismaClient();
const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const notificationService = createNotificationService(prisma);
const shiftService = new ShiftManagementService(prisma);

const timeEntryService = new TimeEntryService(prisma, shiftService);

const leaveService = createLeaveServiceServer(prisma, notificationService);

const overtimeService = new OvertimeServiceServer(
  prisma,
  timeEntryService,
  notificationService,
);

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
  console.log('Handler received event:', JSON.stringify(event, null, 2));
  if (!event) {
    console.error('Event is undefined');
    return;
  }

  if (typeof event !== 'object') {
    console.error('Event is not an object:', event);
    return;
  }

  if (!('type' in event)) {
    console.error('Event does not have a type property:', event);
    return;
  }

  console.log('Event type:', event.type);
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
    const lineUserId = event.source.userId;

    const params = new URLSearchParams(data);
    const action = params.get('action');
    const requestId = params.get('requestId');
    const requestType = params.get('requestType') as 'leave' | 'overtime';

    if (action && requestId && lineUserId && requestType) {
      try {
        const user = await prisma.user.findUnique({ where: { lineUserId } });
        if (!user) {
          throw new Error('User not found');
        }

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

        if (request?.status === 'Pending') {
          if (action === 'approve') {
            if (requestType === 'leave') {
              await leaveService.approveRequest(requestId, user.employeeId);
            } else {
              await overtimeService.handleOvertimeRequest(
                requestId,
                user.employeeId,
                'approve',
              );
            }
          } else if (action === 'deny') {
            if (requestType === 'leave') {
              await leaveService.initiateDenial(requestId, user.employeeId);
            } else {
              await overtimeService.initiateDenial(requestId, user.employeeId);
            }
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: `กรุณาระบุเหตุผลในการปฏิเสธ${requestType === 'leave' ? 'คำขอลา' : 'คำขอทำงานล่วงเวลา'}: [LIFF URL for denial reason]`,
            });
          }
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
    } else {
      console.log('Invalid postback data received');
    }
  } else if (event.type === 'unfollow') {
    console.log('Unfollow event for user ID:', event.source.userId);
  } else {
    console.error('Unhandled event type:', event.type);
  }
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

      let parsedBody;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (parseError) {
        console.error('Error parsing raw body:', parseError);
        return res.status(400).send('Invalid JSON');
      }

      console.log('Parsed body:', JSON.stringify(parsedBody, null, 2));

      if (!parsedBody.events || !Array.isArray(parsedBody.events)) {
        console.error('No events found in request body:', parsedBody);
        return res.status(400).send('No events found');
      }

      const event = parsedBody.events[0];
      await handler(event);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Error in middleware:', err);
      return res.status(500).send('Internal Server Error');
    }
  }

  return res.status(405).send('Method Not Allowed');
};

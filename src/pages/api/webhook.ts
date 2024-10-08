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
  if (!event || typeof event !== 'object' || !('type' in event)) {
    console.error('Invalid event:', event);
    return;
  }

  console.log('Event type:', event.type);
  if (event.type === 'follow') {
    await handleFollow(event);
  } else if (event.type === 'postback') {
    await handlePostback(event);
  } else if (event.type === 'unfollow') {
    console.log('Unfollow event for user ID:', event.source.userId);
  } else {
    console.error('Unhandled event type:', event.type);
  }
};

async function handleFollow(event: WebhookEvent) {
  const userId = event.source.userId;
  console.log('Follow event for user ID:', userId);

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { lineUserId: userId },
      });
      console.log('User lookup result:', user);

      if (!user) {
        const registerRichMenuId = 'richmenu-7f6cc44cf3643bec7374eaeb449c6c71';
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
}

async function handlePostback(event: WebhookEvent) {
  if (event.type !== 'postback') return;
  const data = event.postback.data;
  const lineUserId = event.source.userId;

  const params = new URLSearchParams(data);
  const action = params.get('action');
  const requestId = params.get('requestId');
  const requestType = params.get('requestType') as 'leave' | 'overtime';
  const approverId = params.get('approverId');

  if (action && requestId && lineUserId && requestType && approverId) {
    try {
      const user = await prisma.user.findUnique({ where: { lineUserId } });
      if (!user) {
        throw new Error('User not found');
      }

      let result: { message: string } | undefined;
      if (requestType === 'leave') {
        result = await handleLeaveRequest(action, requestId, approverId);
      } else if (requestType === 'overtime') {
        result = await handleOvertimeRequest(
          action,
          requestId,
          user.employeeId,
        );
      }

      if (result) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: result.message,
        });
      } else {
        throw new Error('No result from request handler');
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
}

async function handleLeaveRequest(
  action: string,
  requestId: string,
  approverId: string,
) {
  if (action === 'approve') {
    await leaveService.approveRequest(requestId, approverId);
    return { message: 'คำขอลาได้รับการอนุมัติแล้ว' };
  } else if (action === 'deny') {
    await leaveService.denyRequest(requestId, approverId);
    return { message: 'คำขอลาถูกปฏิเสธแล้ว' };
  }
  throw new Error('Invalid action for leave request');
}

async function handleOvertimeRequest(
  action: string,
  requestId: string,
  employeeId: string,
) {
  if (action === 'approve' || action === 'deny') {
    await overtimeService.employeeRespondToOvertimeRequest(
      requestId,
      employeeId,
      action,
    );
    return {
      message:
        action === 'approve'
          ? 'คุณได้ยืนยันการทำงานล่วงเวลาแล้ว'
          : 'คุณได้ปฏิเสธการทำงานล่วงเวลาแล้ว',
    };
  }
  throw new Error('Invalid action for overtime request');
}

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

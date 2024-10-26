//webhook.ts
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
import { HolidayService } from '@/services/HolidayService';

dotenv.config({ path: './.env.local' });

const prisma = new PrismaClient();
const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

// Initialize services
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
const shiftService = new ShiftManagementService(prisma, holidayService);
const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const timeEntryService = new TimeEntryService(
  prisma,
  shiftService,
  notificationService,
);

// Initialize OvertimeServiceServer with new dependencies
const overtimeService = new OvertimeServiceServer(
  prisma,
  holidayService,
  leaveServiceServer,
  shiftService,
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
        const richMenuId = await createAndAssignRichMenu(
          user.departmentId || undefined,
          userId,
          user.role as UserRole,
        );
        if (richMenuId) {
          console.log(`Rich menu linked to user ${userId}: ${richMenuId}`);
        } else {
          console.error(`Failed to link rich menu to user ${userId}`);
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
  const approverId = params.get('approverId');

  if (!action || !requestId || !lineUserId || !approverId) {
    console.log('Invalid postback data received');
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Determine the request type based on the request in the database
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });
    const overtimeRequest = await prisma.overtimeRequest.findUnique({
      where: { id: requestId },
    });

    if (leaveRequest) {
      await handleLeaveRequest(
        action,
        requestId,
        user.employeeId,
        event.replyToken,
      );
    } else if (overtimeRequest) {
      await handleOvertimeRequest(action, requestId, user.employeeId);
    } else {
      throw new Error('Request not found');
    }
  } catch (error) {
    console.error('Error processing postback action:', error);
    // Don't send a reply here - let the service handle error responses
  }
}

async function handleLeaveRequest(
  action: string,
  requestId: string,
  approverId: string,
  replyToken: string,
) {
  try {
    // First check if request exists and is still pending
    const existingRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!existingRequest) {
      await client.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบคำขอลาดังกล่าว',
      });
      return;
    }

    // Check if request is already processed
    if (existingRequest.status !== 'Pending') {
      await client.replyMessage(replyToken, {
        type: 'text',
        text: `คำขอนี้ได้ถูก${existingRequest.status === 'Approved' ? 'อนุมัติ' : 'ปฏิเสธ'}ไปแล้ว`,
      });
      return;
    }
    // Clean the approver ID before processing
    const cleanApproverId = approverId.split('-')[0]; // Gets just "E1065" part

    let result;
    if (action === 'approve') {
      result = await leaveServiceServer.approveLeaveRequest(
        requestId,
        cleanApproverId,
        replyToken, // Pass the replyToken here
      );
    } else if (action === 'deny') {
      result = await leaveServiceServer.denyLeaveRequest(
        requestId,
        cleanApproverId,
        replyToken, // Pass the replyToken here
      );
    } else {
      throw new Error('Invalid action');
    }

    // If we get here and haven't sent a reply yet (service didn't handle it), send a default reply
    if (result && replyToken) {
      const message =
        action === 'approve'
          ? 'คำขอลาได้รับการอนุมัติแล้ว'
          : 'คำขอลาถูกปฏิเสธแล้ว';

      await client.replyMessage(replyToken, {
        type: 'text',
        text: message,
      });
    }

    return result;
  } catch (error) {
    console.error('Error handling leave request:', error);

    // Ensure we send an error reply if we have a replyToken
    if (replyToken) {
      try {
        await client.replyMessage(replyToken, {
          type: 'text',
          text: 'เกิดข้อผิดพลาดในการดำเนินการ โปรดลองอีกครั้งในภายหลัง',
        });
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }

    throw error;
  }
}

async function handleOvertimeRequest(
  action: string,
  requestId: string,
  employeeId: string,
) {
  console.log('handleOvertimeRequest called with:', {
    action,
    requestId,
    employeeId,
  });

  if (action === 'approve' || action === 'deny') {
    try {
      const { message } =
        await overtimeService.employeeRespondToOvertimeRequest(
          requestId,
          employeeId,
          action,
        );

      console.log('employeeRespondToOvertimeRequest result:', message);

      return { message };
    } catch (error) {
      console.error('Error in handleOvertimeRequest:', error);
      throw error;
    }
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

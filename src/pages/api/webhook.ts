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

// Rich Menu IDs from the creation script
const RICH_MENU_IDS = {
  REGISTER: 'richmenu-fc12223f4021030d17f15e5538b53fbe',
  GENERAL: 'richmenu-70ea7b2b2962aa373f853fe8dd7ee089',
  ADMIN_1: 'richmenu-efc423abb330477551252d737db592b8',
  ADMIN_2: 'richmenu-064fa9593a85563e491ca5c0982107be',
  MANAGER: 'richmenu-15e254f3f5068fb8768a7b8345735ddd',
  DRIVER: 'richmenu-ec0c4c8ea88848e9f8bf9bc6be54989d',
};

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
  if (event.type !== 'follow') return;

  const userId = event.source.userId;
  if (!userId) return;

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId: userId },
      include: {
        department: true,
      },
    });

    if (!user) {
      // New user - assign register menu
      await client.linkRichMenuToUser(userId, RICH_MENU_IDS.REGISTER);
      console.log(`Assigned register menu to new user ${userId}`);
    } else {
      // Existing user - create and assign menu based on role and department
      try {
        await createAndAssignRichMenu(
          user.department?.name || 'General',
          userId,
          user.role as UserRole,
        );
      } catch (error) {
        console.error('Error in createAndAssignRichMenu:', error);
        // Fallback to direct linking if createAndAssign fails
        await fallbackRichMenuAssignment(userId, user.role as UserRole);
      }
    }
  } catch (error) {
    console.error('Error in handleFollow:', error);
  }
}

async function fallbackRichMenuAssignment(userId: string, role: UserRole) {
  let richMenuId;

  switch (role) {
    case UserRole.GENERAL:
    case UserRole.SALES:
      richMenuId = RICH_MENU_IDS.GENERAL;
      break;
    case UserRole.ADMIN:
    case UserRole.SUPERADMIN:
      richMenuId = RICH_MENU_IDS.ADMIN_1;
      break;
    case UserRole.MANAGER:
      richMenuId = RICH_MENU_IDS.MANAGER;
      break;
    case UserRole.DRIVER:
      richMenuId = RICH_MENU_IDS.DRIVER;
      break;
    default:
      richMenuId = RICH_MENU_IDS.REGISTER;
  }

  try {
    await client.linkRichMenuToUser(userId, richMenuId);
    console.log(`Fallback: Linked rich menu ${richMenuId} to user ${userId}`);
  } catch (error) {
    console.error(`Error in fallback rich menu assignment: ${error}`);
    throw error;
  }
}

async function handlePostback(event: WebhookEvent) {
  if (event.type !== 'postback') return;

  const data = event.postback.data;
  const lineUserId = event.source.userId;
  if (!lineUserId) return;

  console.log('Processing postback data:', data);

  // Handle rich menu switching for admin menus
  if (data.startsWith('richmenu-alias-change:')) {
    const targetMenu = data.split(':')[1];
    let richMenuId;

    switch (targetMenu) {
      case 'admin-menu-1':
        richMenuId = RICH_MENU_IDS.ADMIN_1;
        break;
      case 'admin-menu-2':
        richMenuId = RICH_MENU_IDS.ADMIN_2;
        break;
      default:
        console.error(`Unknown menu alias: ${targetMenu}`);
        return;
    }

    try {
      await client.linkRichMenuToUser(lineUserId, richMenuId);
      console.log(`Switched user ${lineUserId} to rich menu ${richMenuId}`);
    } catch (error) {
      console.error('Error switching rich menu:', error);
    }
    return;
  }

  const params = new URLSearchParams(data);
  const action = params.get('action');
  const requestId = params.get('requestId');
  // Remove approverId check from here since we get it from the user

  if (!action || !requestId || !lineUserId) {
    console.log('Invalid postback data:', { action, requestId, lineUserId });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) {
      console.error('User not found:', lineUserId);
      return;
    }

    // Use the user's employeeId as the approverId
    const approverId = user.employeeId;

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
        approverId, // Pass the approverId from the user
        event.replyToken,
      );
    } else if (overtimeRequest) {
      await handleOvertimeRequest(action, requestId, approverId); // Pass the approverId
    } else {
      console.error('Request not found:', requestId);
    }
  } catch (error) {
    console.error('Error processing postback action:', error);
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

    let result;
    if (action === 'approve') {
      result = await leaveServiceServer.approveLeaveRequest(
        requestId,
        approverId,
        replyToken,
      );
    } else if (action === 'deny') {
      result = await leaveServiceServer.denyLeaveRequest(
        requestId,
        approverId,
        replyToken,
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

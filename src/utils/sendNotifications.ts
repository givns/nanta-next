// sendNotifications.ts

import { Client, Message } from '@line/bot-sdk';
import {
  PrismaClient,
  User,
  LeaveRequest,
  OvertimeRequest,
} from '@prisma/client';
import {
  generateApprovalMessage,
  generateApprovalMessageForAdmins,
} from './generateApprovalMessage';
import {
  generateDenialMessage,
  generateDenialMessageForAdmins,
} from './generateDenialMessage';

const prisma = new PrismaClient();
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

type RequestType = 'leave' | 'overtime';

export const sendApproveNotification = async (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  approver: User,
  requestType: RequestType,
) => {
  try {
    // Send approval message to the user
    const userMessage = generateApprovalMessage(user, request, requestType);
    if (user.lineUserId) {
      await client.pushMessage(user.lineUserId, userMessage);
    }

    // Send approval notification to all admins and super admins, including the approver
    const adminMessage = generateApprovalMessageForAdmins(
      user,
      request,
      approver,
      requestType,
    );
    const adminsAndSuperAdmins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'ADMIN' }, { role: 'SUPERADMIN' }],
      },
    });

    for (const admin of adminsAndSuperAdmins) {
      if (admin.lineUserId) {
        await client.pushMessage(admin.lineUserId, adminMessage);
      }
      console.log(`Sent approval message to ${admin.role}:`, admin.lineUserId);
    }
  } catch (error) {
    console.error('Error sending approval notifications:', error);
  }
};

export const sendDenyNotification = async (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  denier: User,
  denialReason: string,
  requestType: RequestType,
) => {
  try {
    // Send denial message to the user
    const userMessage = generateDenialMessage(
      user,
      request,
      denialReason,
      requestType,
    );
    if (user.lineUserId) {
      await client.pushMessage(user.lineUserId, userMessage);
    }
    console.log('Sent denial message to user:', user.lineUserId);

    // Send denial notification to all admins and super admins, including the denier
    const adminMessage = generateDenialMessageForAdmins(
      user,
      request,
      denier,
      denialReason,
      requestType,
    );
    const adminsAndSuperAdmins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'ADMIN' }, { role: 'SUPERADMIN' }],
      },
    });

    for (const admin of adminsAndSuperAdmins) {
      if (admin.lineUserId) {
        await client.pushMessage(admin.lineUserId, adminMessage);
      }
    }
  } catch (error) {
    console.error('Error sending denial notifications:', error);
  }
};

export const sendDenyReasonPrompt = async (
  admin: User,
  requestId: string,
  requestType: RequestType,
) => {
  try {
    const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/deny-reason?requestId=${requestId}&requestType=${requestType}`;
    const message: Message = {
      type: 'text',
      text: `Please provide a reason for denying this ${requestType} request: ${liffUrl}`,
    };
    if (admin.lineUserId) {
      await client.pushMessage(admin.lineUserId, message);
    }
    console.log(
      `Sent deny reason prompt to admin for ${requestType} request:`,
      admin.lineUserId,
    );
  } catch (error) {
    console.error(
      `Error sending deny reason prompt for ${requestType} request:`,
      error,
    );
    throw error;
  }
};

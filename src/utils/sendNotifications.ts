import { Client, Message } from '@line/bot-sdk';
import { PrismaClient, User, LeaveRequest } from '@prisma/client';
import {
  generateApprovalMessage,
  generateApprovalMessageForAdmins,
} from './generateApprovalMessage';
import {
  generateDenialMessage,
  generateDenialMessageForAdmins,
} from './generateDenialMessage';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const prisma = new PrismaClient();

export const sendApproveNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
  admin: User,
) => {
  try {
    const userMessage = generateApprovalMessage(user, leaveRequest);
    await client.pushMessage(user.lineUserId, userMessage);
    console.log('Sent approval message to user:', user.lineUserId);

    const adminMessage = generateApprovalMessageForAdmins(
      user,
      leaveRequest,
      admin,
    );
    const admins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'admin' }, { role: 'superadmin' }],
      },
    });
    for (const otherAdmin of admins) {
      if (otherAdmin.id !== admin.id) {
        await client.pushMessage(otherAdmin.lineUserId, adminMessage);
        console.log('Sent approval message to admin:', otherAdmin.lineUserId);
      }
    }
  } catch (error) {
    console.error('Error sending approval notifications:', error);
    throw error;
  }
};

export const sendDenyNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
  admin: User,
  denialReason: string,
) => {
  try {
    const userMessage = generateDenialMessage(user, leaveRequest, denialReason);
    await client.pushMessage(user.lineUserId, userMessage);
    console.log('Sent denial message to user:', user.lineUserId);

    const adminMessage = generateDenialMessageForAdmins(
      user,
      leaveRequest,
      admin,
      denialReason,
    );
    const admins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'admin' }, { role: 'superadmin' }],
      },
    });
    for (const otherAdmin of admins) {
      if (otherAdmin.id !== admin.id) {
        await client.pushMessage(otherAdmin.lineUserId, adminMessage);
        console.log('Sent denial message to admin:', otherAdmin.lineUserId);
      }
    }
  } catch (error) {
    console.error('Error sending denial notifications:', error);
    throw error;
  }
};

export const sendDenyReasonPrompt = async (admin: User, requestId: string) => {
  try {
    const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/deny-reason?requestId=${requestId}`;
    const message: Message = {
      type: 'text',
      text: `Please provide a reason for denying this leave request: ${liffUrl}`,
    };
    await client.pushMessage(admin.lineUserId, message);
    console.log('Sent deny reason prompt to admin:', admin.lineUserId);
  } catch (error) {
    console.error('Error sending deny reason prompt:', error);
    throw error;
  }
};

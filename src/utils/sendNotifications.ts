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

const prisma = new PrismaClient();
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export const sendApproveNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
  approver: User,
) => {
  try {
    // Send approval message to the user
    const userMessage = generateApprovalMessage(user, leaveRequest);
    await client.pushMessage(user.lineUserId, userMessage);
    console.log('Sent approval message to user:', user.lineUserId);

    // Send approval notification to all admins and super admins, including the approver
    const adminMessage = generateApprovalMessageForAdmins(
      user,
      leaveRequest,
      approver,
    );
    const adminsAndSuperAdmins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'ADMIN' }, { role: 'SUPERADMIN' }],
      },
    });

    for (const admin of adminsAndSuperAdmins) {
      await client.pushMessage(admin.lineUserId, adminMessage);
      console.log(`Sent approval message to ${admin.role}:`, admin.lineUserId);
    }
  } catch (error) {
    console.error('Error sending approval notifications:', error);
  }
};

export const sendDenyNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
  denier: User,
  denialReason: string,
) => {
  try {
    // Send denial message to the user
    const userMessage = generateDenialMessage(user, leaveRequest, denialReason);
    await client.pushMessage(user.lineUserId, userMessage);
    console.log('Sent denial message to user:', user.lineUserId);

    // Send denial notification to all admins and super admins, including the denier
    const adminMessage = generateDenialMessageForAdmins(
      user,
      leaveRequest,
      denier,
      denialReason,
    );
    const adminsAndSuperAdmins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'ADMIN' }, { role: 'SUPERADMIN' }],
      },
    });

    for (const admin of adminsAndSuperAdmins) {
      await client.pushMessage(admin.lineUserId, adminMessage);
      console.log(`Sent denial message to ${admin.role}:`, admin.lineUserId);
    }
  } catch (error) {
    console.error('Error sending denial notifications:', error);
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

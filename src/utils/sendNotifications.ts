import { Client } from '@line/bot-sdk';
import { PrismaClient, User, LeaveRequest } from '@prisma/client';
import {
  generateApprovalMessage,
  generateApprovalMessageForAdmins,
} from './generateApprovalMessage';
import {
  generateDenialMessage,
  generateDenialMessageForAdmins,
} from './generateDenialMessage';
import { sendLeaveRequestNotification } from './sendLeaveRequestNotification';

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
    console.log('Generating approval message for user...');
    const userMessage = generateApprovalMessage(user, leaveRequest);
    console.log('Sending approval message to user...');
    await client.pushMessage(user.lineUserId, userMessage);
    console.log('Approval message sent to user:', user.lineUserId);

    console.log('Generating approval message for admins...');
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

    console.log('Sending approval messages to admins...');
    for (const adminUser of admins) {
      await client.pushMessage(adminUser.lineUserId, adminMessage);
      console.log('Approval message sent to admin:', adminUser.lineUserId);
    }
  } catch (error) {
    console.error('Error sending approval notifications:', error);
  }
};

export const sendDenyNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
  denialReason: string,
  admin: User,
) => {
  try {
    console.log('Generating denial message for user...');
    const userMessage = generateDenialMessage(user, leaveRequest, denialReason);
    console.log('Sending denial message to user...');
    await client.pushMessage(user.lineUserId, userMessage);
    console.log('Denial message sent to user:', user.lineUserId);

    console.log('Generating denial message for admins...');
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

    console.log('Sending denial messages to admins...');
    for (const adminUser of admins) {
      await client.pushMessage(adminUser.lineUserId, adminMessage);
      console.log('Denial message sent to admin:', adminUser.lineUserId);
    }
  } catch (error) {
    console.error('Error sending denial notifications:', error);
  }
};

export const notifyAdmins = async (leaveRequest: LeaveRequest) => {
  try {
    console.log('Notifying all admins of new leave request...');
    const admins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'admin' }, { role: 'superadmin' }],
      },
    });

    for (const admin of admins) {
      await sendLeaveRequestNotification(admin, leaveRequest);
      console.log('Notified admin:', admin.lineUserId);
    }
  } catch (error) {
    console.error('Error notifying admins:', error);
  }
};

export const getLeaveRequestCount = async () => {
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const endOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  );

  const leaveRequestCount = await prisma.leaveRequest.count({
    where: {
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
  });

  return leaveRequestCount;
};

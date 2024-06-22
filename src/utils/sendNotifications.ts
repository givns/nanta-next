// utils/sendNotifications.ts

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
    // Send approval message to the user
    const userMessage = generateApprovalMessage(user, leaveRequest);
    await client.pushMessage(user.lineUserId, userMessage);
    console.log('Sent approval message to user:', user.lineUserId);

    // Send approval message to all admins
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
    for (const admin of admins) {
      await client.pushMessage(admin.lineUserId, adminMessage);
      console.log('Sent approval message to admin:', admin.lineUserId);
    }
  } catch (error) {
    console.error('Error sending approval notifications:', error);
  }
};

export const sendDenyNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
  admin: User,
) => {
  try {
    // Send denial message to the user
    const userMessage = generateDenialMessage(user, leaveRequest, '');
    await client.pushMessage(user.lineUserId, userMessage);
    console.log('Sent denial message to user:', user.lineUserId);

    // Send denial message to all admins
    const adminMessage = generateDenialMessageForAdmins(
      user,
      leaveRequest,
      admin,
      '',
    );
    const admins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'admin' }, { role: 'superadmin' }],
      },
    });
    for (const admin of admins) {
      await client.pushMessage(admin.lineUserId, adminMessage);
      console.log('Sent denial message to admin:', admin.lineUserId);
    }
  } catch (error) {
    console.error('Error sending denial notifications:', error);
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

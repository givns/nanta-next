import { PrismaClient } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import {
  sendApproveNotification,
  sendDenyNotification,
} from './sendNotifications';

const prisma = new PrismaClient();
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export const handleApprove = async (requestId: string, lineUserId: string) => {
  try {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Approved', approverId: lineUserId },
      include: { user: true },
    });

    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (leaveRequest.user && admin) {
      await sendApproveNotification(leaveRequest.user, leaveRequest, admin);
    } else {
      console.error('User or admin not found:', {
        user: leaveRequest.user,
        admin,
      });
    }

    return leaveRequest;
  } catch (error: any) {
    console.error('Error approving leave request:', error.message);
    throw error;
  }
};

export const handleDeny = async (requestId: string, lineUserId: string) => {
  try {
    const existingRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!existingRequest || existingRequest.status !== 'Pending') {
      console.log('Leave request has already been processed:', existingRequest);
      return;
    }

    // Update the status to 'DenialPending' instead of 'Denied'
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'DenialPending', approverId: lineUserId },
    });
    console.log('Leave request pending denial:', leaveRequest);

    // Send a message to the admin to provide a denial reason
    const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/deny-reason?requestId=${requestId}&approverId=${lineUserId}`;
    await client.pushMessage(lineUserId, {
      type: 'text',
      text: `Please provide a reason for denying this leave request: ${liffUrl}`,
    });
  } catch (error: any) {
    console.error('Error initiating leave request denial:', error.message);
    throw error;
  }
};

export const finalizeDenial = async (
  requestId: string,
  lineUserId: string,
  denialReason: string,
) => {
  try {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Denied', denialReason },
    });

    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (user && admin) {
      await sendDenyNotification(user, leaveRequest, admin, denialReason);
    } else {
      console.error('User or admin not found:', { user, admin });
    }

    return leaveRequest;
  } catch (error: any) {
    console.error('Error finalizing leave request denial:', error.message);
    throw error;
  }
};

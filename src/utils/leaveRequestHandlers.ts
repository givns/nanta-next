import { PrismaClient } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import { sendDenyNotification } from './sendNotifications';

const prisma = new PrismaClient();
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export const handleApprove = async (requestId: string, userId: string) => {
  try {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'approved', approverId: userId },
    });
    console.log('Leave request approved:', leaveRequest);

    await client.pushMessage(leaveRequest.userId, {
      type: 'text',
      text: 'Your leave request has been approved!',
    });
  } catch (error: any) {
    console.error('Error approving leave request:', error.message);
  }
};

export const handleDeny = async (
  requestId: string,
  userId: string,
  denialReason: string | null,
) => {
  try {
    if (!denialReason) {
      throw new Error('Denial reason is required');
    }

    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'denied', approverId: userId, denialReason },
    });
    console.log('Leave request denied:', leaveRequest);

    await client.pushMessage(leaveRequest.userId, {
      type: 'text',
      text: 'Your leave request has been denied.',
    });

    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    if (user) {
      await sendDenyNotification(user, leaveRequest, denialReason);
    }
  } catch (error: any) {
    console.error('Error denying leave request:', error.message);
  }
};

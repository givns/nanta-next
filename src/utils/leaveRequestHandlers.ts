import { PrismaClient } from '@prisma/client';
import {
  sendApproveNotification,
  sendDenyNotification,
} from './sendNotifications';

const prisma = new PrismaClient();

export const handleApprove = async (requestId: string, lineUserId: string) => {
  try {
    // Check if the request has already been approved or denied
    const existingRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!existingRequest || existingRequest.status !== 'Pending') {
      console.log('Leave request has already been processed:', existingRequest);
      return;
    }

    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Approved', approverId: lineUserId },
    });
    console.log('Leave request approved:', leaveRequest);

    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (user && admin) {
      await sendApproveNotification(user, leaveRequest, admin);
    } else {
      console.error('User or admin not found:', { user, admin });
    }
  } catch (error: any) {
    console.error('Error approving leave request:', error.message);
  } finally {
    await prisma.$disconnect();
  }
};

export const handleDeny = async (requestId: string, lineUserId: string) => {
  try {
    // Check if the request has already been approved or denied
    const existingRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!existingRequest || existingRequest.status !== 'Pending') {
      console.log('Leave request has already been processed:', existingRequest);
      return;
    }

    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Denied', approverId: lineUserId, denialReason: '' },
    });
    console.log('Leave request denied:', leaveRequest);

    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (user && admin) {
      await sendDenyNotification(user, leaveRequest, admin);
    } else {
      console.error('User or admin not found:', { user, admin });
    }
  } catch (error: any) {
    console.error('Error denying leave request:', error.message);
  } finally {
    await prisma.$disconnect();
  }
};

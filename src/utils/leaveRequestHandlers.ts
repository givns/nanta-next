import { PrismaClient } from '@prisma/client';
import {
  sendApproveNotification,
  sendDenyNotification,
  notifyAdmins,
} from './sendNotifications';

const prisma = new PrismaClient();

export const handleApprove = async (requestId: string, userId: string) => {
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
      data: { status: 'Approved', approverId: userId },
    });
    console.log('Leave request approved:', leaveRequest);

    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    const admin = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user && admin) {
      await sendApproveNotification(user, leaveRequest, admin);
      await notifyAdmins(leaveRequest);
    }
  } catch (error: any) {
    console.error('Error approving leave request:', error.message);
  }
};

export const handleDeny = async (
  requestId: string,
  userId: string,
  denialReason: string,
) => {
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
      data: { status: 'Denied', approverId: userId, denialReason },
    });
    console.log('Leave request denied:', leaveRequest);

    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    const admin = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user && admin) {
      await sendDenyNotification(user, leaveRequest, denialReason, admin);
      await notifyAdmins(leaveRequest);
    }
  } catch (error: any) {
    console.error('Error denying leave request:', error.message);
  }
};

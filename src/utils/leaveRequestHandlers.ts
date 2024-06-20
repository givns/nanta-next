// leaveRequestHandlers.ts
import { PrismaClient } from '@prisma/client';
import {
  sendApproveNotification,
  sendDenyNotification,
} from './sendNotifications';

const prisma = new PrismaClient();

// leaveRequestHandlers.ts

export const handleApprove = async (requestId: string, userId: string) => {
  try {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (leaveRequest && leaveRequest.status === 'pending') {
      const updatedLeaveRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'approved', approverId: userId },
      });
      console.log('Leave request approved:', updatedLeaveRequest);

      const user = await prisma.user.findUnique({
        where: { id: leaveRequest.userId },
      });

      if (user) {
        await sendApproveNotification(user, updatedLeaveRequest);
      }
    } else {
      console.log('Leave request already handled or not found.');
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
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (leaveRequest && leaveRequest.status === 'pending') {
      const updatedLeaveRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'denied', approverId: userId, denialReason },
      });
      console.log('Leave request denied:', updatedLeaveRequest);

      const user = await prisma.user.findUnique({
        where: { id: leaveRequest.userId },
      });

      if (user) {
        await sendDenyNotification(user, updatedLeaveRequest, denialReason);
      }
    } else {
      console.log('Leave request already handled or not found.');
    }
  } catch (error: any) {
    console.error('Error denying leave request:', error.message);
  }
};

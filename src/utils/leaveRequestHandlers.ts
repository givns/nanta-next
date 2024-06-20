// leaveRequestHandlers.ts
import { PrismaClient } from '@prisma/client';
import {
  sendApproveNotification,
  sendDenyNotification,
} from './sendNotifications';

const prisma = new PrismaClient();

export const handleApprove = async (requestId: string, userId: string) => {
  try {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Approved', approverId: userId },
    });
    console.log('Leave request approved:', leaveRequest);

    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    if (user) {
      await sendApproveNotification(user, leaveRequest);
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
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'Denied', approverId: userId, denialReason },
    });
    console.log('Leave request denied:', leaveRequest);

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

import { PrismaClient, LeaveRequest } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import {
  sendApproveNotification,
  sendDenyNotification,
} from './sendNotifications';
import { sendLeaveRequestNotification } from './sendLeaveRequestNotification';

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
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'DenialPending', approverId: lineUserId },
      include: { user: true },
    });

    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (admin) {
      // Send a message to the admin to provide a denial reason
      const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/deny-reason?requestId=${requestId}&approverId=${lineUserId}`;
      await client.pushMessage(lineUserId, {
        type: 'text',
        text: `กรุณาระบุเหตุผลในการไม่อนุมัติคำขอลา: ${liffUrl}`,
      });
    } else {
      console.error('Admin not found:', { lineUserId });
    }

    return leaveRequest;
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
      include: { user: true },
    });

    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (leaveRequest.user && admin) {
      await sendDenyNotification(
        leaveRequest.user,
        leaveRequest,
        admin,
        denialReason,
      );
    } else {
      console.error('User or admin not found:', {
        user: leaveRequest.user,
        admin,
      });
    }

    return leaveRequest;
  } catch (error: any) {
    console.error('Error finalizing leave request denial:', error.message);
    throw error;
  }
};

export const getOriginalLeaveRequest = async (requestId: string) => {
  try {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!leaveRequest) {
      throw new Error('Original leave request not found');
    }

    return leaveRequest;
  } catch (error: any) {
    console.error('Error fetching original leave request:', error.message);
    throw error;
  }
};

export const createResubmittedLeaveRequest = async (
  originalRequestId: string,
  updatedData: Partial<LeaveRequest>,
  lineUserId: string,
) => {
  try {
    const originalRequest = await getOriginalLeaveRequest(originalRequestId);

    const newLeaveRequest = await prisma.leaveRequest.create({
      data: {
        ...originalRequest,
        ...updatedData,
        id: undefined, // Let Prisma generate a new ID
        status: 'Pending',
        resubmitted: true,
        originalRequestId,
        createdAt: undefined, // Let Prisma set the current timestamp
        updatedAt: undefined, // Let Prisma set the current timestamp
      },
      include: { user: true }, // Include user data for the notification
    });

    // Notify admins about the resubmitted request
    const admins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'admin' }, { role: 'superadmin' }],
      },
    });

    for (const admin of admins) {
      await sendLeaveRequestNotification(admin, newLeaveRequest);
    }

    return newLeaveRequest;
  } catch (error: any) {
    console.error('Error creating resubmitted leave request:', error.message);
    throw error;
  }
};

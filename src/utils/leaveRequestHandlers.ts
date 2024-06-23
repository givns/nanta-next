import { PrismaClient, User, LeaveRequest } from '@prisma/client';
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
        text: `Please provide a reason for denying this leave request: ${liffUrl}`,
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

export const handleResubmit = async (requestId: string, lineUserId: string) => {
  try {
    const originalRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!originalRequest) {
      throw new Error('Original leave request not found');
    }

    // Create a new leave request based on the original
    const newRequest = await prisma.leaveRequest.create({
      data: {
        userId: originalRequest.userId,
        leaveType: originalRequest.leaveType,
        leaveFormat: originalRequest.leaveFormat,
        startDate: originalRequest.startDate,
        endDate: originalRequest.endDate,
        reason: originalRequest.reason,
        fullDayCount: originalRequest.fullDayCount,
        status: 'Pending',
        resubmitted: true,
        originalRequestId: requestId,
      },
    });

    // Send a confirmation message to the user
    await client.pushMessage(lineUserId, {
      type: 'text',
      text: 'คำขอลาใหม่ของคุณได้ถูกส่งเรียบร้อยแล้ว โปรดรอการอนุมัติ',
    });

    // Notify admins about the new request
    const admins = await prisma.user.findMany({
      where: {
        OR: [{ role: 'admin' }, { role: 'superadmin' }],
      },
    });

    for (const admin of admins) {
      await client.pushMessage(admin.lineUserId, {
        type: 'text',
        text: `มีคำขอลาใหม่จาก ${originalRequest.user.name} (ส่งใหม่)`,
      });
    }

    return newRequest;
  } catch (error: any) {
    console.error('Error handling resubmission:', error.message);
    await client.pushMessage(lineUserId, {
      type: 'text',
      text: 'ขออภัย เกิดข้อผิดพลาดในการส่งคำขอลาใหม่ โปรดลองอีกครั้งในภายหลัง',
    });
    throw error;
  }
};

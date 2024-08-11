// requestHandlers.ts

import { PrismaClient, LeaveRequest, OvertimeRequest } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import {
  sendApproveNotification,
  sendDenyNotification,
} from './sendNotifications';
import { sendRequestNotification } from './sendRequestNotification';
import { UserRole } from '../types/enum';

const prisma = new PrismaClient();
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export type RequestType = 'leave' | 'overtime';
type RequestModel = typeof prisma.leaveRequest | typeof prisma.overtimeRequest;

const getRequestModel = (type: RequestType): RequestModel => {
  return type === 'leave' ? prisma.leaveRequest : prisma.overtimeRequest;
};

export const handleApprove = async (
  requestId: string,
  lineUserId: string,
  requestType: 'leave' | 'overtime',
) => {
  try {
    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    const model = getRequestModel(requestType);
    let request;

    if (requestType === 'leave') {
      request = await (model as typeof prisma.leaveRequest).update({
        where: { id: requestId },
        data: {
          status: 'approved',
          approverId: admin.id,
        },
        include: { user: true },
      });
    } else {
      request = await (model as typeof prisma.overtimeRequest).update({
        where: { id: requestId },
        data: {
          status: 'approved',
          approverId: admin.id,
        },
        include: { user: true },
      });
    }

    if (request.user) {
      await sendApproveNotification(request.user, request, admin, requestType);
    } else {
      console.error('User not found:', { request });
    }

    return request;
  } catch (error: any) {
    console.error(`Error approving ${requestType} request:`, error.message);
    throw error;
  }
};

export const handleDeny = async (
  requestId: string,
  lineUserId: string,
  requestType: 'leave' | 'overtime',
) => {
  try {
    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    const model = getRequestModel(requestType);
    let request;

    if (requestType === 'leave') {
      request = await (model as typeof prisma.leaveRequest).update({
        where: { id: requestId },
        data: {
          status: 'DenialPending',
          approverId: admin.id,
        },
        include: { user: true },
      });
    } else {
      request = await (model as typeof prisma.overtimeRequest).update({
        where: { id: requestId },
        data: {
          status: 'DenialPending',
          approverId: admin.id,
        },
        include: { user: true },
      });
    }

    const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/deny-reason?requestId=${requestId}&approverId=${admin.id}&requestType=${requestType}`;
    await client.pushMessage(lineUserId, {
      type: 'text',
      text: `กรุณาระบุเหตุผลในการไม่อนุมัติคำขอ${requestType === 'leave' ? 'ลา' : 'ทำงานล่วงเวลา'}: ${liffUrl}`,
    });

    return request;
  } catch (error: any) {
    console.error(
      `Error initiating ${requestType} request denial:`,
      error.message,
    );
    throw error;
  }
};

export const finalizeDenial = async (
  requestId: string,
  lineUserId: string,
  denialReason: string,
  requestType: RequestType,
) => {
  try {
    const model = getRequestModel(requestType);
    let request;

    if (requestType === 'leave') {
      request = await (model as typeof prisma.leaveRequest).update({
        where: { id: requestId },
        data: { status: 'Denied', denialReason, approverId: lineUserId },
        include: { user: true },
      });
    } else {
      request = await (model as typeof prisma.overtimeRequest).update({
        where: { id: requestId },
        data: { status: 'Denied', denialReason, approverId: lineUserId },
        include: { user: true },
      });
    }

    const admin = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (request.user && admin) {
      await sendDenyNotification(
        request.user,
        request,
        admin,
        denialReason,
        requestType,
      );
    } else {
      console.error('User or admin not found:', {
        user: request.user,
        admin,
      });
    }

    return request;
  } catch (error: any) {
    console.error(
      `Error finalizing ${requestType} request denial:`,
      error.message,
    );
    throw error;
  }
};

export const getOriginalRequest = async (
  requestId: string,
  requestType: RequestType,
) => {
  try {
    const model = getRequestModel(requestType);
    let request;

    if (requestType === 'leave') {
      request = await (model as typeof prisma.leaveRequest).findUnique({
        where: { id: requestId },
      });
    } else {
      request = await (model as typeof prisma.overtimeRequest).findUnique({
        where: { id: requestId },
      });
    }

    if (!request) {
      throw new Error(`Original ${requestType} request not found`);
    }

    return request;
  } catch (error: any) {
    console.error(
      `Error fetching original ${requestType} request:`,
      error.message,
    );
    throw error;
  }
};

export const createResubmittedRequest = async (
  originalRequestId: string,
  updatedData: Partial<LeaveRequest | OvertimeRequest>,
  requestType: RequestType,
) => {
  try {
    const model = getRequestModel(requestType);
    const originalRequest = await getOriginalRequest(
      originalRequestId,
      requestType,
    );

    let newRequest;

    if (requestType === 'leave') {
      newRequest = await (model as typeof prisma.leaveRequest).create({
        data: {
          ...(originalRequest as LeaveRequest),
          ...updatedData,
          id: undefined,
          status: 'Pending',
          resubmitted: true,
          originalRequestId,
          createdAt: undefined,
          updatedAt: undefined,
        } as any,
        include: { user: true },
      });
    } else {
      newRequest = await (model as typeof prisma.overtimeRequest).create({
        data: {
          ...(originalRequest as OvertimeRequest),
          ...updatedData,
          id: undefined,
          status: 'Pending',
          resubmitted: true,
          originalRequestId,
          createdAt: undefined,
          updatedAt: undefined,
        } as any,
        include: { user: true },
      });
    }

    const admins = await prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN.toString(), UserRole.SUPERADMIN.toString()],
        },
      },
    });

    for (const admin of admins) {
      await sendRequestNotification(admin, newRequest, requestType);
    }

    return newRequest;
  } catch (error: any) {
    console.error(
      `Error creating resubmitted ${requestType} request:`,
      error.message,
    );
    throw error;
  }
};

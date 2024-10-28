// pages/api/leaveRequest/index.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { createLeaveServiceServer } from '../../../../services/LeaveServiceServer';
import { ILeaveServiceBase } from '../../../../types/LeaveService';
import { PrismaClient } from '@prisma/client';
import { createNotificationService } from '../../../../services/NotificationService';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);
const leaveService: ILeaveServiceBase = createLeaveServiceServer(
  prisma,
  notificationService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const {
      lineUserId,
      leaveType,
      leaveFormat,
      reason,
      startDate,
      endDate,
      fullDayCount,
    } = req.body;

    try {
      const newLeaveRequest = await leaveService.createLeaveRequest(
        lineUserId,
        leaveType,
        leaveFormat,
        reason,
        startDate,
        endDate,
        fullDayCount,
      );
      res.status(201).json({
        success: true,
        message: 'Leave request created successfully',
        data: newLeaveRequest,
      });
    } catch (error: any) {
      console.error('Error creating leave request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  } else if (req.method === 'GET') {
    const { userId } = req.query;

    try {
      let leaveRequests;
      if (userId && typeof userId === 'string') {
        // If userId is provided, fetch leave requests for that user
        leaveRequests = await leaveService.getLeaveRequests(userId);
      } else {
        // If no userId is provided, fetch all leave requests (admin view)
        leaveRequests = await leaveService.getAllLeaveRequests();
      }
      res.status(200).json({ success: true, data: leaveRequests });
    } catch (error: any) {
      console.error('Error fetching leave requests:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

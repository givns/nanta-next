// pages/api/leaveRequest/create.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { LeaveServiceServer } from '../../../services/LeaveServiceServer';

const leaveService = new LeaveServiceServer();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const {
    lineUserId,
    leaveType,
    leaveFormat,
    reason,
    startDate,
    endDate,
    fullDayCount,
    useOvertimeHours,
    resubmitted,
    originalRequestId,
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
      useOvertimeHours,
      resubmitted,
      originalRequestId,
    );

    res.status(201).json({
      success: true,
      message: resubmitted
        ? 'Leave request resubmitted successfully'
        : 'Leave request created successfully',
      data: newLeaveRequest,
    });
  } catch (error: any) {
    console.error('Error creating/resubmitting leave request:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

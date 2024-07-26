import type { NextApiRequest, NextApiResponse } from 'next';
import { LeaveServiceServer } from '../../../services/LeaveServiceServer';

const leaveService = new LeaveServiceServer();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
    console.log('Received leave request data:', req.body);

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

    console.log('Leave request created:', newLeaveRequest);

    return res.status(201).json(newLeaveRequest);
  } catch (error: any) {
    console.error('Error creating leave request:', error);
    return res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
}

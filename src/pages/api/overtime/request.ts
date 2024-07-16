import { NextApiRequest, NextApiResponse } from 'next';
import { OvertimeServiceServer } from '../../../services/OvertimeServiceServer';

const overtimeService = new OvertimeServiceServer();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    lineUserId,
    date,
    startTime,
    endTime,
    reason,
    resubmitted,
    originalRequestId,
  } = req.body;

  if (!lineUserId || !date || !startTime || !endTime || !reason) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newOvertimeRequest = await overtimeService.createOvertimeRequest(
      lineUserId,
      date,
      startTime,
      endTime,
      reason,
      resubmitted,
      originalRequestId,
    );

    // Check if the request was auto-approved
    const isAutoApproved = newOvertimeRequest.status === 'approved';

    res.status(201).json({
      success: true,
      message: isAutoApproved
        ? 'Overtime request auto-approved successfully'
        : resubmitted
          ? 'Overtime request resubmitted successfully'
          : 'Overtime request created successfully',
      data: newOvertimeRequest,
      isAutoApproved,
    });
  } catch (error: any) {
    console.error('Error creating/resubmitting overtime request:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

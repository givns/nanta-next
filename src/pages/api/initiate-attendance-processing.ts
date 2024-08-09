// pages/api/initiate-attendance-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getAttendanceProcessingQueue } from '../../lib/queue';
import { logMessage } from '../../utils/inMemoryLogger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  logMessage('Attendance processing API endpoint called');

  if (req.method !== 'POST') {
    logMessage(`Method not allowed: ${req.method}`);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.body;

  if (!employeeId) {
    logMessage('Employee ID is missing');
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    logMessage(
      `Getting attendance processing queue for employee: ${employeeId}`,
    );
    const queue = getAttendanceProcessingQueue();

    logMessage('Adding job to queue');
    const job = await queue.add('process-payroll', { employeeId });

    logMessage(`Job added to queue with ID: ${job.id}`);

    res.status(202).json({
      message: 'Attendance processing job initiated',
      jobId: job.id,
    });
  } catch (error: any) {
    logMessage(`Error initiating attendance processing: ${error.message}`);
    console.error('Error initiating attendance processing:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: error.message });
  }
}

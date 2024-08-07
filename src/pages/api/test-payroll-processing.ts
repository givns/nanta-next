// pages/api/test-payroll-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getAttendanceProcessingQueue } from '../../lib/queue';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.body;

  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const queue = getAttendanceProcessingQueue();
    const job = await queue.add('process-payroll', { employeeId });

    res.status(202).json({
      message: 'Payroll processing job initiated',
      jobId: job.id,
    });
  } catch (error: any) {
    console.error('Error initiating payroll processing:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: error.message });
  }
}

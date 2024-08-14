// pages/api/test-payroll-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getAttendanceProcessingQueue } from '../../lib/queue';
import { logMessage } from '../../utils/inMemoryLogger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  console.log('Received request body:', req.body);

  const { employeeId, payrollPeriod } = req.body;

  if (!employeeId || !payrollPeriod) {
    console.log('Missing required fields:', { employeeId, payrollPeriod });
    return res
      .status(400)
      .json({ error: 'Employee ID and payroll period are required' });
  }

  try {
    const queue = getAttendanceProcessingQueue();
    if (!queue) {
      throw new Error('Failed to initialize attendance processing queue');
    }

    const job = await queue.add('process-payroll', {
      employeeId,
      payrollPeriod,
    });
    logMessage(`Job added to queue with ID: ${job.id}`);

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

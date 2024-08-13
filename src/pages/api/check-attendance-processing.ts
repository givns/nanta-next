// pages/api/check-attendance-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getAttendanceProcessingQueue } from '../../lib/queue';
import { getLogs } from '../../utils/inMemoryLogger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { jobId, employeeId } = req.query;

  if (!jobId || !employeeId) {
    return res
      .status(400)
      .json({ error: 'Job ID and Employee ID are required' });
  }

  try {
    const queue = getAttendanceProcessingQueue();
    const job = await queue.getJob(jobId as string);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobStatus = await job.getState();
    const logs = getLogs();

    if (jobStatus === 'completed') {
      const result = await job.returnvalue;

      return res.status(200).json({
        status: 'completed',
        data: {
          userData: result.userData,
          processedAttendance: result.processedAttendance,
          summary: result.summary,
          payrollPeriod: result.payrollPeriod,
        },
        logs,
      });
    } else if (jobStatus === 'failed') {
      return res.status(500).json({
        status: 'failed',
        error: 'Job processing failed',
        logs,
      });
    } else {
      return res.status(202).json({
        status: jobStatus,
        message: 'Job is still processing',
        logs,
      });
    }
  } catch (error: any) {
    console.error('Error checking attendance processing status:', error);
    return res
      .status(500)
      .json({ error: 'Internal server error', message: error.message });
  }
}

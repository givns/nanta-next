// pages/api/check-attendance-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getAttendanceProcessingQueue } from '../../lib/queue';
import prisma from '../../lib/prisma';

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

    if (jobStatus === 'completed') {
      const processedAttendance = await prisma.processedAttendance.findMany({
        where: {
          employeeId: employeeId as string,
        },
        orderBy: { date: 'desc' },
      });

      res.status(200).json({
        status: 'completed',
        data: processedAttendance,
      });
    } else if (jobStatus === 'failed') {
      res.status(500).json({
        status: 'failed',
        error: 'Job processing failed',
      });
    } else {
      res.status(202).json({
        status: jobStatus,
        message: 'Job is still processing',
      });
    }
  } catch (error: any) {
    console.error('Error checking attendance processing status:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: error.message });
  }
}

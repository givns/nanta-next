// pages/api/check-payroll-processing.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getAttendanceProcessingQueue } from '../../lib/queue';
import prisma from '../../lib/prisma';
import { logMessage } from '../../utils/inMemoryLogger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { jobId, employeeId } = req.query;
  logMessage(`Checking status for job ID: ${jobId}`);

  if (!jobId || !employeeId) {
    return res
      .status(400)
      .json({ error: 'Job ID and Employee ID are required' });
  }

  try {
    const queue = getAttendanceProcessingQueue();
    const job = await queue.getJob(jobId as string);

    if (!job) {
      // Check if we have a result in the database even if the job is not found
      const payrollProcessingResult =
        await prisma.payrollProcessingResult.findFirst({
          where: {
            employeeId: employeeId as string,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      if (payrollProcessingResult) {
        const processedData = JSON.parse(
          payrollProcessingResult.processedData as string,
        );
        return res.status(200).json({
          status: 'completed',
          data: processedData,
        });
      }

      return res
        .status(404)
        .json({ error: 'Job not found and no results available' });
    }

    const jobStatus = await job.getState();

    if (jobStatus === 'completed') {
      const payrollProcessingResult =
        await prisma.payrollProcessingResult.findFirst({
          where: {
            employeeId: employeeId as string,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      if (!payrollProcessingResult) {
        return res
          .status(404)
          .json({ error: 'Payroll processing result not found' });
      }

      const processedData = JSON.parse(
        payrollProcessingResult.processedData as string,
      );

      return res.status(200).json({
        status: 'completed',
        data: processedData,
      });
    } else if (jobStatus === 'failed') {
      const jobError = job.failedReason;
      return res.status(500).json({
        status: 'failed',
        error: jobError || 'Job processing failed',
      });
    } else {
      return res.status(202).json({
        status: jobStatus,
        message: 'Job is still processing',
      });
    }
  } catch (error: any) {
    console.error('Error checking payroll processing status:', error);
    return res
      .status(500)
      .json({ error: 'Internal server error', message: error.message });
  }
}

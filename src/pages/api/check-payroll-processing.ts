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
  logMessage(
    `Checking status for job ID: ${jobId}, Employee ID: ${employeeId}`,
  );

  if (!jobId || !employeeId) {
    return res
      .status(400)
      .json({ error: 'Job ID and Employee ID are required' });
  }

  try {
    let queue;
    try {
      queue = getAttendanceProcessingQueue();
      logMessage('Queue retrieved successfully');
    } catch (queueError) {
      logMessage(`Error getting queue: ${queueError}`);
      return res.status(500).json({
        error: 'Error retrieving queue',
        details: (queueError as Error).message,
      });
    }

    let job;
    try {
      job = await queue.getJob(`process-payroll:${jobId}`);
      logMessage(`Job retrieved: ${job ? 'Yes' : 'No'}`);
    } catch (jobError) {
      logMessage(`Error getting job from queue: ${jobError}`);
      // Continue execution to check database for results
    }

    if (!job) {
      logMessage(
        `Job ${jobId} not found in queue. Checking database for results.`,
      );
      try {
        const result = await checkDatabaseForResults(employeeId as string);
        if (result) {
          return res.status(200).json(result);
        }
        return res
          .status(404)
          .json({ error: 'Job not found and no results available' });
      } catch (dbError) {
        logMessage(`Error checking database for results: ${dbError}`);
        return res.status(500).json({
          error: 'Error checking database for results',
          details: (dbError as Error).message,
        });
      }
    }

    let jobStatus;
    try {
      jobStatus = await job.getState();
      logMessage(`Job status: ${jobStatus}`);
    } catch (stateError) {
      const error: Error = stateError as Error;
      logMessage(`Error getting job state: ${error}`);
      return res
        .status(500)
        .json({ error: 'Error retrieving job state', details: error.message });
    }

    if (jobStatus === 'completed') {
      try {
        let processedData;
        let payrollProcessingResult; // Declare the variable here
        try {
          payrollProcessingResult = await getPrismaResult(employeeId as string);
          if (payrollProcessingResult) {
            processedData = JSON.parse(
              payrollProcessingResult.processedData as string,
            );
          } else {
            return res
              .status(404)
              .json({ error: 'Payroll processing result not found' });
          }
        } catch (parseError) {
          logMessage(`Error parsing processed data: ${parseError}`);
          const error: Error = parseError as Error;
          return res.status(500).json({
            error: 'Error parsing processed data',
            details: error.message,
          });
        }

        return res.status(200).json({
          status: 'completed',
          data: processedData,
        });
      } catch (prismaError) {
        logMessage(`Prisma error: ${prismaError}`);
        return res.status(500).json({
          error: 'Database error',
          details: (prismaError as Error).message,
        });
      }
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
    logMessage(`Unhandled error in check-payroll-processing: ${error}`);
    console.error('Error checking payroll processing status:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: error.stack,
    });
  }
}

async function checkDatabaseForResults(employeeId: string) {
  try {
    const payrollProcessingResult = await getPrismaResult(employeeId);

    if (payrollProcessingResult) {
      return {
        status: 'completed',
        data: {
          employeeId: payrollProcessingResult.employeeId,
          periodStart: payrollProcessingResult.periodStart,
          periodEnd: payrollProcessingResult.periodEnd,
          totalWorkingDays: payrollProcessingResult.totalWorkingDays,
          totalPresent: payrollProcessingResult.totalPresent,
          totalAbsent: payrollProcessingResult.totalAbsent,
          totalOvertimeHours: payrollProcessingResult.totalOvertimeHours,
          totalRegularHours: payrollProcessingResult.totalRegularHours,
          processedData: JSON.parse(payrollProcessingResult.processedData),
        },
      };
    }

    return null;
  } catch (error) {
    logMessage(`Error checking database for results: ${error}`);
    throw error;
  }
}

async function getPrismaResult(employeeId: string) {
  try {
    return await prisma.payrollProcessingResult.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  } catch (prismaError) {
    logMessage(`Prisma error: ${prismaError}`);
    throw prismaError;
  }
}

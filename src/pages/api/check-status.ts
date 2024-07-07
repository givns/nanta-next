// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '../../services/ShiftManagementService';
import prisma from '../../lib/prisma';
import Queue from 'bull';

const attendanceService = new AttendanceService();
const shiftManagementService = new ShiftManagementService();

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error('REDIS_URL is not defined in the environment variables');
}

const registrationQueue = new Queue('user-registration', REDIS_URL);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, jobId } = req.query;

  if (jobId) {
    // Check registration job status
    try {
      const job = await registrationQueue.getJob(jobId as string);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const state = await job.getState();
      const progress = job.progress();

      return res.status(200).json({ jobId, state, progress });
    } catch (error) {
      console.error('Error checking job status:', error);
      return res.status(500).json({ message: 'Error checking job status' });
    }
  }

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });
    if (!user) throw new Error('User not found');

    const status =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    const shiftAdjustment =
      await shiftManagementService.getShiftAdjustmentForDate(
        user.id,
        new Date(),
      );

    res.status(200).json({
      ...status,
      user: {
        ...user,
        assignedShift: user.assignedShift,
      },
      shiftAdjustment: shiftAdjustment,
    });
  } catch (error: any) {
    console.error('Error checking status:', error);
    res
      .status(500)
      .json({ message: 'Error checking status', error: error.message });
  }
}

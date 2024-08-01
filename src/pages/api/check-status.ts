// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { logMessage } from '../../utils/inMemoryLogger';

const attendanceService = new AttendanceService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  logMessage('Received request for check-status');
  logMessage(`Query parameters: ${JSON.stringify(req.query)}`);

  if (req.method !== 'GET') {
    logMessage(`Method not allowed: ${req.method}`);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    logMessage(`Invalid or missing employeeId: ${employeeId}`);
    return res.status(400).json({ message: 'Valid Employee ID is required' });
  }

  try {
    logMessage(`Fetching attendance status for employeeId: ${employeeId}`);
    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    logMessage(
      `Attendance status retrieved: ${JSON.stringify(attendanceStatus, null, 2)}`,
    );

    return res.status(200).json(attendanceStatus);
  } catch (error: any) {
    logMessage(`Error in check-status handler: ${error.message}`);
    logMessage(`Error stack: ${error.stack}`);

    // Handle specific database error
    if (error.code === 'ER_CANT_AGGREGATE_2COLLATIONS') {
      logMessage('Database collation mismatch error detected');
      return res.status(500).json({
        message: 'Database configuration error. Please contact support.',
        error: 'COLLATION_MISMATCH',
      });
    }

    return res.status(error.statusCode || 500).json({
      message: error.message || 'Error checking status',
      error: error.name || 'UNKNOWN_ERROR',
    });
  }
}

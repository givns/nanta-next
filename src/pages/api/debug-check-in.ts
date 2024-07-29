// pages/api/debug-check-in.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceProcessingService } from '../../services/AttendanceProcessingService';
import { ExternalDbService } from '../../services/ExternalDbService';
import prisma from '../../lib/prisma';
import moment from 'moment-timezone';

const attendanceProcessingService = new AttendanceProcessingService();
const externalDbService = new ExternalDbService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, date } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ message: 'Valid Employee ID is required' });
  }

  try {
    const debugInfo: any = {
      employeeId,
      date,
      timestamp: new Date().toISOString(),
    };

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    debugInfo.user = {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      assignedShift: user.assignedShift,
    };

    const queryDate = moment.tz(date as string, 'Asia/Bangkok').toDate();
    const nextDay = moment(queryDate).add(1, 'day').toDate();

    debugInfo.internalAttendance = await prisma.attendance.findFirst({
      where: {
        userId: user.id,
        date: {
          gte: queryDate,
          lt: nextDay,
        },
      },
      orderBy: { checkInTime: 'asc' },
    });

    const { records } = await externalDbService.getDailyAttendanceRecords(
      employeeId,
      2,
    ); // Fetch 2 days to catch potential check-outs
    debugInfo.externalAttendance = records.find(
      (record) =>
        moment(record.sj).isSameOrAfter(queryDate) &&
        moment(record.sj).isBefore(nextDay),
    );

    const overtimeRequests = await prisma.overtimeRequest.findMany({
      where: {
        userId: user.id,
        date: queryDate,
        status: 'approved',
      },
    });

    debugInfo.processedAttendance =
      await attendanceProcessingService.processAttendance(
        debugInfo.internalAttendance,
        debugInfo.externalAttendance,
        user.assignedShift,
        overtimeRequests,
      );

    return res.status(200).json(debugInfo);
  } catch (error: any) {
    console.error('Error in debug-check-in handler:', error);
    return res.status(500).json({
      message: error.message || 'Error processing debug check-in',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

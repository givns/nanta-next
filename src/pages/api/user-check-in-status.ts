// pages/api/user-check-in-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '@/services/ExternalDbService';
import { HolidayService } from '@/services/HolidayService';
import { Shift104HolidayService } from '@/services/Shift104HolidayService';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();
const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        assignedShift: true,
        department: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const attendanceStatus = await attendanceService.getLatestAttendanceStatus(
      user.employeeId,
    );

    const responseData = {
      user: {
        employeeId: user.employeeId,
        name: user.name,
        nickname: user.nickname,
        department: user.department.name,
        assignedShift: user.assignedShift,
        profilePictureUrl: user.profilePictureUrl,
      },
      attendanceStatus,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user check-in data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { sendConfirmationMessage } from '../../utils/lineNotifications';
import { attendanceService } from '../../services/AttendanceService';
import { CheckInFormData, Attendance, UserData } from '../../types/user';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    userId,
    location,
    address,
    reason,
    photo,
    timestamp,
    deviceSerial,
  }: CheckInFormData = req.body;

  try {
    const thaiTime = new Date(timestamp);

    // Proceed with check-in using AttendanceService
    const attendance: Attendance = await attendanceService.checkIn({
      userId,
      location,
      address,
      reason,
      photo,
      deviceSerial,
    });

    // Send confirmation message
    const user = (await prisma.user.findUnique({
      where: { id: userId },
    })) as UserData | null;
    if (user) {
      await sendConfirmationMessage(user.lineUserId, true, thaiTime);
    }

    res.status(200).json({ message: 'Check-in successful', data: attendance });
  } catch (error: any) {
    console.error('Error during check-in:', error);
    if (error.message.includes('Already checked in')) {
      return res.status(400).json({ message: error.message });
    }
    res
      .status(500)
      .json({ message: 'Error processing check-in', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

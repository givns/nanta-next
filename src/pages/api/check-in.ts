import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { query } from '../../utils/mysqlConnection';
import { sendConfirmationMessage } from '../../utils/lineNotifications';

const prisma = new PrismaClient();

interface ExternalCheckData {
  dev_serial: string;
  sj: string;
  user_serial: string;
  fx: string | null;
  // Add other properties as needed
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId, location, address, reason, photo, timestamp, deviceSerial } =
    req.body;

  try {
    const thaiTime = new Date(timestamp);
    const utcTime = new Date(thaiTime.getTime() - 7 * 60 * 60 * 1000);

    // Check MongoDB (via Prisma) for existing check-in
    const existingCheckIn = await prisma.checkIn.findFirst({
      where: {
        userId: userId,
        checkOutTime: null,
      },
    });

    if (existingCheckIn) {
      return res.status(400).json({ message: 'Already checked in (MongoDB)' });
    }

    // Check MySQL for existing check-in
    const externalCheckIns = await query<ExternalCheckData>(
      'SELECT * FROM kt_jl WHERE user_serial = ? AND fx IS NULL ORDER BY sj DESC LIMIT 1',
      [userId],
    );

    if (externalCheckIns.length > 0) {
      return res
        .status(400)
        .json({ message: 'Already checked in (External Device)' });
    }

    // If no existing check-ins, proceed with check-in
    const checkIn = await prisma.checkIn.create({
      data: {
        user: { connect: { id: userId } },
        location: location as any,
        address,
        reason: reason || null,
        photo,
        checkInTime: utcTime,
        deviceSerial: deviceSerial || null,
      },
    });

    // Send confirmation message
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await sendConfirmationMessage(user.lineUserId, true, thaiTime);
    }

    res.status(200).json({ message: 'Check-in successful', data: checkIn });
  } catch (error: any) {
    console.error('Error during check-in:', error);
    res
      .status(500)
      .json({ message: 'Error processing check-in', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

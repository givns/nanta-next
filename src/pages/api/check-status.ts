// pages/api/check-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { query } from '../../utils/mysqlConnection';

const prisma = new PrismaClient();

const MIN_CHECK_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds, adjust as needed

interface ExternalCheckData {
  id: number;
  user_serial: string;
  sj: string;
  fx: string | null;
  bh: number;
  dev_serial: string;
  // Add other properties as needed
}

interface ExternalUserData {
  user_serial: string;
  user_no: string;
  user_name: string;
  // Add other properties as needed
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(400).json({ message: 'Invalid lineUserId' });
  }

  try {
    console.log('Fetching user for lineUserId:', lineUserId);

    // Fetch user from Prisma
    const prismaUser = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!prismaUser) {
      console.log(
        'User not found in Prisma database for lineUserId:',
        lineUserId,
      );
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch user from external SQL database using the common identifier
    // Assuming 'employeeId' is the common identifier
    const externalUsers = await query<ExternalUserData>(
      'SELECT * FROM dt_user WHERE user_no = ?',
      [prismaUser.employeeId], // Assuming we've added employeeId to the Prisma User model
    );

    const externalUser = externalUsers[0];

    if (!externalUser) {
      console.log(
        'User not found in external database for employeeId:',
        prismaUser.employeeId,
      );
      // We might want to log this discrepancy for administrative review
    }

    console.log('User found:', JSON.stringify(prismaUser, null, 2));

    // Fetch latest check-in from Prisma
    const latestPrismaCheckIn = await prisma.checkIn.findFirst({
      where: { userId: prismaUser.id },
      orderBy: { checkInTime: 'desc' },
    });

    // Fetch latest check-in from external database
    const externalCheckIns = await query<ExternalCheckData>(
      'SELECT * FROM kt_jl WHERE user_serial = ? ORDER BY sj DESC LIMIT 1',
      [externalUser ? externalUser.user_serial : prismaUser.employeeId],
    );

    const latestExternalCheckIn = externalCheckIns[0];

    console.log(
      'Latest Prisma check-in:',
      JSON.stringify(latestPrismaCheckIn, null, 2),
    );
    console.log(
      'Latest external check-in:',
      JSON.stringify(latestExternalCheckIn, null, 2),
    );

    const now = new Date();
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

    let status: 'checkin' | 'checkout';
    let message: string | null = null;
    let checkInId: string | null = null;
    let deviceSerial: string | null = null;

    // Determine the most recent check-in
    const prismaCheckInTime = latestPrismaCheckIn
      ? new Date(latestPrismaCheckIn.checkInTime)
      : new Date(0);
    const externalCheckInTime = latestExternalCheckIn
      ? new Date(latestExternalCheckIn.sj)
      : new Date(0);
    const mostRecentCheckInTime = new Date(
      Math.max(prismaCheckInTime.getTime(), externalCheckInTime.getTime()),
    );

    const timeSinceCheckIn =
      thaiNow.getTime() - mostRecentCheckInTime.getTime();

    if (timeSinceCheckIn < MIN_CHECK_INTERVAL) {
      status = 'checkout';
      message =
        'Too soon to check in/out. Please wait before attempting again.';
    } else if (
      (latestPrismaCheckIn && !latestPrismaCheckIn.checkOutTime) ||
      (latestExternalCheckIn && !latestExternalCheckIn.fx)
    ) {
      status = 'checkout';
      checkInId = latestPrismaCheckIn ? latestPrismaCheckIn.id : null;
      deviceSerial = latestPrismaCheckIn
        ? latestPrismaCheckIn.deviceSerial
        : latestExternalCheckIn
          ? latestExternalCheckIn.dev_serial
          : null;
    } else {
      status = 'checkin';
    }

    console.log('Final status:', {
      status,
      checkInId,
      userData: prismaUser,
      message,
      deviceSerial,
      externalCheckData: latestExternalCheckIn || null,
    });

    return res.status(200).json({
      status,
      checkInId,
      userData: prismaUser,
      message,
      deviceSerial,
      externalCheckData: latestExternalCheckIn || null,
    });
  } catch (error) {
    console.error('Error checking user status:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    await prisma.$disconnect();
  }
}

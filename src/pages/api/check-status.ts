// pages/api/check-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { query } from '../../utils/mysqlConnection';
import { ExternalCheckData } from '../../types/user';
const prisma = new PrismaClient();

const MIN_CHECK_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds, adjust as needed

interface ExternalUserData {
  user_serial: string;
  user_no: string;
  user_name: string;
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

    // Fetch user from external SQL database
    const externalUsers = await query<ExternalUserData>(
      'SELECT * FROM dt_user WHERE user_no = ?',
      [prismaUser.employeeId],
    );

    const externalUser = externalUsers[0];

    if (!externalUser) {
      console.log(
        'User not found in external database for employeeId:',
        prismaUser.employeeId,
      );
    }

    console.log('User found:', JSON.stringify(prismaUser, null, 2));

    // Fetch latest check-in from external database for the user
    const userLatestCheckIn = await query<ExternalCheckData>(
      'SELECT * FROM kt_jl WHERE user_serial = ? ORDER BY sj DESC LIMIT 1',
      [externalUser ? externalUser.user_serial : prismaUser.employeeId],
    );

    // Fetch latest check-in from external device (regardless of user)
    const latestDeviceCheckIn = await query<ExternalCheckData>(
      'SELECT * FROM kt_jl ORDER BY sj DESC LIMIT 1',
    );

    console.log(
      'Latest user check-in:',
      JSON.stringify(userLatestCheckIn[0], null, 2),
    );
    console.log(
      'Latest device check-in:',
      JSON.stringify(latestDeviceCheckIn[0], null, 2),
    );

    const now = new Date();
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

    let status: 'checkin' | 'checkout';
    let message: string | null = null;
    let checkInId: string | null = null;
    let deviceSerial: string | null = null;

    // Determine the most recent check-in
    const userCheckInTime = userLatestCheckIn[0]
      ? new Date(userLatestCheckIn[0].sj)
      : new Date(0);
    const deviceCheckInTime = latestDeviceCheckIn[0]
      ? new Date(latestDeviceCheckIn[0].sj)
      : new Date(0);
    const mostRecentCheckInTime = new Date(
      Math.max(userCheckInTime.getTime(), deviceCheckInTime.getTime()),
    );

    const timeSinceCheckIn =
      thaiNow.getTime() - mostRecentCheckInTime.getTime();

    if (timeSinceCheckIn < MIN_CHECK_INTERVAL) {
      status = 'checkout';
      message =
        'Too soon to check in/out. Please wait before attempting again.';
    } else if (
      (userLatestCheckIn[0] && userLatestCheckIn[0].fx === 0) ||
      (latestDeviceCheckIn[0] && latestDeviceCheckIn[0].fx === 0)
    ) {
      status = 'checkout';
      checkInId = userLatestCheckIn[0]
        ? userLatestCheckIn[0].bh.toString()
        : null;
      deviceSerial = userLatestCheckIn[0]
        ? userLatestCheckIn[0].dev_serial
        : latestDeviceCheckIn[0]
          ? latestDeviceCheckIn[0].dev_serial
          : null;
    } else {
      status = 'checkin';
    }

    const responseData = {
      status,
      checkInId,
      userData: prismaUser,
      message,
      deviceSerial,
      userLatestCheckIn: userLatestCheckIn[0] || null,
      latestDeviceCheckIn: latestDeviceCheckIn[0] || null,
    };

    console.log('Final status:', JSON.stringify(responseData, null, 2));

    return res.status(200).json(responseData);
  } catch (error: any) {
    console.error('Error checking user status:', error);
    return res
      .status(500)
      .json({ message: 'Server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

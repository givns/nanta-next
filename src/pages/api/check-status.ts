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

    // Determine the most recent check-in
    let latestCheckIn = null;
    if (userLatestCheckIn[0] && latestDeviceCheckIn[0]) {
      latestCheckIn =
        new Date(userLatestCheckIn[0].sj) > new Date(latestDeviceCheckIn[0].sj)
          ? userLatestCheckIn[0]
          : latestDeviceCheckIn[0];
    } else {
      latestCheckIn = userLatestCheckIn[0] || latestDeviceCheckIn[0];
    }

    let isCheckingIn: boolean;
    let message: string | null = null;

    if (latestCheckIn) {
      const timeSinceCheckIn =
        thaiNow.getTime() - new Date(latestCheckIn.sj).getTime();
      if (timeSinceCheckIn < MIN_CHECK_INTERVAL) {
        message =
          'Too soon to check in/out. Please wait before attempting again.';
        isCheckingIn = latestCheckIn.fx !== 0; // Keep the current status
      } else {
        isCheckingIn = latestCheckIn.fx !== 0;
      }
    } else {
      isCheckingIn = true; // If no check-in record, user should check in
    }

    const responseData = {
      latestCheckIn,
      isCheckingIn,
      checkInId: latestCheckIn ? latestCheckIn.bh.toString() : null,
      message,
      userData: prismaUser,
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

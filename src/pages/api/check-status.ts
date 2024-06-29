// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MIN_CHECK_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds, adjust as needed

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
    const user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      console.log('User not found for lineUserId:', lineUserId);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('User found:', JSON.stringify(user, null, 2));

    console.log('Fetching latest check-in for user:', user.id);
    const latestCheckIn = await prisma.checkIn.findFirst({
      where: {
        userId: user.id,
        checkOutTime: null,
      },
      orderBy: { checkInTime: 'desc' },
    });

    console.log('Latest check-in:', JSON.stringify(latestCheckIn, null, 2));

    const now = new Date();
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

    let status: 'checkin' | 'checkout';
    let message: string | null = null;
    let checkInId: string | null = null;

    if (latestCheckIn) {
      console.log('Found an open check-in');
      const thaiCheckInTime = new Date(
        latestCheckIn.checkInTime.getTime() + 7 * 60 * 60 * 1000,
      );
      const timeSinceCheckIn = thaiNow.getTime() - thaiCheckInTime.getTime();

      console.log('Time since check-in (ms):', timeSinceCheckIn);
      console.log('Minimum check interval (ms):', MIN_CHECK_INTERVAL);

      if (timeSinceCheckIn < MIN_CHECK_INTERVAL) {
        status = 'checkin';
        message =
          'Too soon to check out. Please wait before attempting to check out.';
      } else {
        status = 'checkout';
        checkInId = latestCheckIn.id;
      }
    } else {
      console.log('No open check-in found, checking for latest check-out');
      const latestCheckOut = await prisma.checkIn.findFirst({
        where: {
          userId: user.id,
          checkOutTime: { not: null },
        },
        orderBy: { checkOutTime: 'desc' },
      });

      console.log('Latest check-out:', JSON.stringify(latestCheckOut, null, 2));

      if (latestCheckOut) {
        const timeSinceCheckOut =
          now.getTime() - latestCheckOut.checkOutTime!.getTime();

        console.log('Time since check-out (ms):', timeSinceCheckOut);
        console.log('Minimum check interval (ms):', MIN_CHECK_INTERVAL);

        if (timeSinceCheckOut < MIN_CHECK_INTERVAL) {
          status = 'checkout';
          message =
            'Too soon to check in. Please wait before attempting to check in again.';
        } else {
          status = 'checkin';
        }
      } else {
        status = 'checkin';
      }
    }

    console.log('Final status:', {
      status,
      checkInId,
      userData: user,
      message,
    });

    return res.status(200).json({
      status,
      checkInId,
      userData: user,
      message,
    });
  } catch (error) {
    console.error('Error checking user status:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    await prisma.$disconnect();
  }
}

// confirmRegistration.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import { processRegistration } from '../../lib/processRegistration';

const prisma = new PrismaClient();
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, lineUserId, profilePictureUrl } = req.body;

  try {
    const result = await processRegistration(
      employeeId,
      lineUserId,
      profilePictureUrl,
      prisma,
      lineClient,
    );

    res.status(200).json({
      success: true,
      message: 'Registration completed successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error confirming registration:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { sendCheckInFlexMessage } from '@/utils/sendCheckInFlexMessage'; // Adjust the import paths based on your project structure

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId, address, reason, photo, timestamp } = req.body;

  if (!userId || !address || !photo || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const checkInData = await prisma.checkIn.create({
      data: {
        userId,
        address,
        reason: reason || null, // Ensure reason is properly handled as an optional field
        photo,
        timestamp: new Date(timestamp),
      },
    });

    await sendCheckInFlexMessage(user, checkInData);
    return res.status(200).json({ data: checkInData });
  } catch (error) {
    console.error('Error during check-in process:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

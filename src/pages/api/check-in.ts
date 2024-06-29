import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/utils/db'; // Adjust the import path based on your project structure
import { sendCheckInFlexMessage } from '@/utils/sendCheckInFlexMessage'; // Adjust the import path based on your project structure

interface CheckInRequestBody {
  userId: string;
  name: string;
  nickname: string;
  department: string;
  address: string;
  latitude: string;
  longitude: string;
  reason?: string;
  photo: string;
  timestamp: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    userId,
    name,
    nickname,
    department,
    address,
    latitude,
    longitude,
    reason,
    photo,
    timestamp,
  } = req.body as CheckInRequestBody;

  if (
    !userId ||
    !name ||
    !nickname ||
    !department ||
    !address ||
    !latitude ||
    !longitude ||
    !photo ||
    !timestamp
  ) {
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
        name,
        nickname,
        department,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        reason: reason || null,
        photo,
        timestamp: new Date(timestamp),
      },
    });

    await sendCheckInFlexMessage(user, checkInData);
    
    return res.status(200).json({ 
      message: 'Check-in successful',
      data: checkInData 
    });
  } catch (error) {
    console.error('Error during check-in process:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await prisma.$disconnect();
  }
}

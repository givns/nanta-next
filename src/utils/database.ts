import { PrismaClient } from '@prisma/client'; // Assuming you are using Prisma for database operations

const prisma = new PrismaClient();

interface CheckInData {
  userId: string;
  address: string;
  reason: string;
  photo: string;
  timestamp: string;
}

export async function getUserByLineUserId(lineUserId: string) {
  return prisma.user.findUnique({
    where: { lineUserId },
  });
}

export async function saveCheckInData(checkInData: CheckInData) {
  return prisma.checkIn.create({
    data: {
      userId: checkInData.userId,
      address: checkInData.address,
      reason: checkInData.reason,
      photo: checkInData.photo,
      timestamp: new Date(checkInData.timestamp),
    },
  });
}

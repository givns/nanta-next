import { PrismaClient } from '@prisma/client';
import { calculateDistance } from '../utils/distance';

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  const prisma = new PrismaClient();

  prisma.$extends({
    model: {
      trackingSession: {
        async calculateTotalDistance(sessionId: string) {
          const locations = await prisma.gpsLocation.findMany({
            where: { trackingSessionId: sessionId },
            orderBy: { timestamp: 'asc' },
          });

          let totalDistance = 0;
          for (let i = 1; i < locations.length; i++) {
            const prevLoc = locations[i - 1];
            const currLoc = locations[i];
            totalDistance += calculateDistance(
              prevLoc.latitude,
              prevLoc.longitude,
              currLoc.latitude,
              currLoc.longitude,
            );
          }

          return totalDistance;
        },
      },
    },
  });

  return prisma;
};

const prisma = global.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

export default prisma;

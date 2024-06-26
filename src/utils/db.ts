import { PrismaClient } from '@prisma/client';
import { calculateDistance } from '../utils/distance';

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

let prisma: ReturnType<typeof prismaClientSingleton>;

if (!globalThis.prisma) {
  globalThis.prisma = prismaClientSingleton();
}
prisma = globalThis.prisma;

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;

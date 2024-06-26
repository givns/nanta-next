import { PrismaClient } from '@prisma/client';
import { calculateDistance } from '../utils/distance';

// Define the type for our custom methods
type CustomMethods = {
  trackingSession: {
    calculateTotalDistance: (sessionId: string) => Promise<number>;
  };
};

// Create a type that combines PrismaClient with our custom methods
type PrismaClientWithExtensions = PrismaClient & CustomMethods;

// Function to create the Prisma client with extensions
function createPrismaClient(): PrismaClientWithExtensions {
  const prisma = new PrismaClient().$extends({
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

  return prisma as unknown as PrismaClientWithExtensions;
}

// Declare the global type
declare global {
  var prisma: PrismaClientWithExtensions | undefined;
}

// Create or reuse the Prisma client
const prisma = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

export default prisma;

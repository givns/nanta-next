import { PrismaClient } from '@prisma/client';
import { calculateDistance } from '../utils/distance';

class ExtendedPrismaClient extends PrismaClient {
  async calculateTotalDistance(sessionId: string): Promise<number> {
    const locations = await this.gpsLocation.findMany({
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
  }
}

const prisma = new ExtendedPrismaClient();
export default prisma;

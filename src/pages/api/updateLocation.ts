import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { trackingSessionId, locations } = req.body;

      const createdLocations = await prisma.gpsLocation.createMany({
        data: locations.map((loc: any) => ({
          trackingSessionId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          timestamp: new Date(loc.timestamp),
        })),
      });

      res.status(200).json({ success: true, count: createdLocations.count });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: 'Failed to update locations' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

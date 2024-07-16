// pages/api/external-check-in-out.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { ExternalDbService } from '../../services/ExternalDbService';
import { AttendanceSyncService } from '../../services/AttendanceSyncService';
import prisma from '../../lib/prisma';

const externalDbService = new ExternalDbService();
const attendanceSyncService = new AttendanceSyncService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const data = req.body;

  try {
    // Create entry in external database
    if (data.isManualEntry) {
      await externalDbService.createManualEntry(data);
    } else {
      await externalDbService.createCheckIn(data);
    }

    // Sync attendance data for the user
    const user = await prisma.user.findUnique({
      where: { employeeId: data.employeeId },
      include: { assignedShift: true },
    });

    if (!user) {
      throw new Error('User not found in our database');
    }

    await attendanceSyncService.syncUserAttendance(user);

    res
      .status(200)
      .json({ message: 'Check-in/out processed and synced successfully' });
  } catch (error: any) {
    console.error('Error processing check-in/out:', error);
    res
      .status(500)
      .json({ message: 'Error processing check-in/out', error: error.message });
  }
}

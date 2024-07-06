// pages/api/external-check-in-out.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { ExternalDbService } from '../../services/ExternalDbService';
import { AttendanceService } from '../../services/AttendanceService';

const externalDbService = new ExternalDbService();
const attendanceService = new AttendanceService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const data = req.body;

  try {
    // Create manual entry in external database
    await externalDbService.createManualEntry(data);

    // Fetch user info
    const userInfo = await externalDbService.getUserInfo(data.employeeId);
    if (!userInfo) {
      throw new Error('User not found in external database');
    }

    // Process both check-in and check-out for manual entry
    await attendanceService.processExternalCheckInOut(
      { ...data, fx: 0 },
      userInfo,
    );
    if (data.checkOutTimestamp) {
      await attendanceService.processExternalCheckInOut(
        {
          ...data,
          fx: 1,
          sj: data.checkOutTimestamp,
        },
        userInfo,
      );
    }

    res.status(200).json({ message: 'Manual entry processed successfully' });
  } catch (error: any) {
    console.error('Error processing manual entry:', error);
    res
      .status(500)
      .json({ message: 'Error processing manual entry', error: error.message });
  }
}

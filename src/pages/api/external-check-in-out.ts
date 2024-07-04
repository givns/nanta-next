import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '../../services/ExternalDbService';
import { ExternalCheckInData } from '../../types/user';

const attendanceService = new AttendanceService();
const externalDbService = new ExternalDbService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { type, ...data } = req.body;

    if (type === 'manual') {
      await externalDbService.createManualEntry(data);
      // Process both check-in and check-out for manual entry
      await attendanceService.processExternalCheckInOut({ ...data, fx: 0 });
      if (data.checkOutTimestamp) {
        await attendanceService.processExternalCheckInOut({
          ...data,
          fx: 1,
          sj: data.checkOutTimestamp,
        });
      }
    } else {
      const externalData: ExternalCheckInData = data;
      await attendanceService.processExternalCheckInOut(externalData);
    }

    res.status(200).json({ message: 'Check-in/out processed successfully' });
  } catch (error) {
    console.error('Error processing external check-in/out:', error);
    res.status(500).json({ error: 'Failed to process check-in/out' });
  }
}

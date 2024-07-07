import type { NextApiRequest, NextApiResponse } from 'next';
import { HolidayService } from '../../services/HolidayService';

const holidayService = new HolidayService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { year } = req.body;

  if (!year || typeof year !== 'number') {
    return res.status(400).json({ message: 'Invalid year provided' });
  }

  try {
    await holidayService.syncHolidays(year);
    res.status(200).json({ message: `Holidays synced for year ${year}` });
  } catch (error) {
    console.error('Error syncing holidays:', error);
    res.status(500).json({ message: 'Error syncing holidays' });
  }
}

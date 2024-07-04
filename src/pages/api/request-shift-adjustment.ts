import { NextApiRequest, NextApiResponse } from 'next';
import { ShiftManagementService } from '../../services/ShiftManagementService';

const shiftManagementService = new ShiftManagementService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { userId, requestedShiftId, date, reason } = req.body;

    try {
      const request = await shiftManagementService.requestShiftAdjustment(
        userId,
        requestedShiftId,
        new Date(date),
        reason,
      );
      res.status(201).json({ success: true, data: request });
    } catch (error: any) {
      console.error('Error requesting shift adjustment:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

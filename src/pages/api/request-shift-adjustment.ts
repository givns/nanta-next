// pages/api/request-shift-adjustment.ts

import { ShiftManagementService } from '../../services/ShiftManagementService';
import { NextApiRequest, NextApiResponse } from 'next';

const shiftManagementService = new ShiftManagementService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { userId, requestedShiftId, date, reason } = req.body;
    const request = await shiftManagementService.requestShiftAdjustment(
      userId,
      requestedShiftId,
      new Date(date),
      reason,
    );
    res.status(200).json(request);
  } else {
    res.status(405).end();
  }
}

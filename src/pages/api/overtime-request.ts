// pages/api/overtime-request.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { OvertimeService } from '../../services/OvertimeService';

const overtimeService = new OvertimeService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      const { userId, date, startTime, endTime } = req.body;
      const overtimeRequest = await overtimeService.createOvertimeRequest(
        userId,
        new Date(date),
        startTime,
        endTime,
      );
      res.status(201).json(overtimeRequest);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create overtime request' });
    }
  } else if (req.method === 'GET') {
    try {
      const { userId } = req.query;
      if (userId && typeof userId === 'string') {
        const requests = await overtimeService.getUserOvertimeRequests(userId);
        res.status(200).json(requests);
      } else {
        const pendingRequests =
          await overtimeService.getPendingOvertimeRequests();
        res.status(200).json(pendingRequests);
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch overtime requests' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

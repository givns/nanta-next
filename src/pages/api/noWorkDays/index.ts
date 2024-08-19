import { NextApiRequest, NextApiResponse } from 'next';
import { NoWorkDayService } from '@/services/NoWorkDayService';

const noWorkDayService = new NoWorkDayService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const noWorkDays = await noWorkDayService.getNoWorkDays();
    res.status(200).json(noWorkDays);
  } else if (req.method === 'POST') {
    const { date, reason } = req.body;
    const newNoWorkDay = await noWorkDayService.addNoWorkDay(
      new Date(date),
      reason,
    );
    res.status(201).json(newNoWorkDay);
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

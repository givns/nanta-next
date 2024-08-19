import { NextApiRequest, NextApiResponse } from 'next';
import { NoWorkDayService } from '@/services/NoWorkDayService';

const noWorkDayService = new NoWorkDayService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (req.method === 'DELETE') {
    await noWorkDayService.deleteNoWorkDay(id as string);
    res.status(204).end();
  } else {
    res.setHeader('Allow', ['DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

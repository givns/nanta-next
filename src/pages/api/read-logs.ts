import { NextApiRequest, NextApiResponse } from 'next';
import { getLogs, clearLogs } from '../../utils/inMemoryLogger';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const logs = getLogs();
    res.status(200).json({ logs });
  } else if (req.method === 'DELETE') {
    clearLogs();
    res.status(200).json({ message: 'Logs cleared' });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}

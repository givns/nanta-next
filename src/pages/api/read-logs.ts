import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const logFilePath = path.join(process.cwd(), 'server-logs.txt');

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const logs = fs.readFileSync(logFilePath, 'utf-8');
      res.status(200).json({ logs });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read logs' });
    }
  } else if (req.method === 'DELETE') {
    try {
      fs.writeFileSync(logFilePath, '');
      res.status(200).json({ message: 'Logs cleared' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear logs' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';

let logs: string[] = [];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Add a new log entry
    const { message } = req.body;
    logs.push(message);
    res.status(200).json({ success: true });
  } else if (req.method === 'GET') {
    // Retrieve all logs
    res.status(200).json(logs);
  } else if (req.method === 'DELETE') {
    // Clear all logs
    logs = [];
    res.status(200).json({ success: true });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}

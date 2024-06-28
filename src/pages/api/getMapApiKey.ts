import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // You might want to add additional security checks here
  res.status(200).json({ apiKey: process.env.GOOGLE_MAPS_API });
}

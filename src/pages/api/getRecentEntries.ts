// in pages/api/getRecentEntries.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ExternalDbService } from '../../services/ExternalDbService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const externalDbService = new ExternalDbService();
    const recentEntries = await externalDbService.getRecentEntries();
    res
      .status(200)
      .json({ message: 'Data retrieved successfully', data: recentEntries });
  } catch (error: any) {
    console.error('Error retrieving recent entries:', error);
    res
      .status(500)
      .json({ message: 'Error retrieving data', error: error.message });
  }
}

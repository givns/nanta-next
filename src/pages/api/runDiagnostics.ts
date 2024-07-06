// pages/api/runDiagnostics.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ExternalDbService } from '../../services/ExternalDbService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const externalDbService = new ExternalDbService();
    await externalDbService.runDiagnosticQueries();
    res
      .status(200)
      .json({
        message: 'Diagnostic queries completed. Check server logs for results.',
      });
  } catch (error) {
    console.error('Error running diagnostic queries:', error);
    res.status(500).json({ message: 'Error running diagnostic queries' });
  }
}

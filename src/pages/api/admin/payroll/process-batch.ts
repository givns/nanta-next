// pages/api/admin/payroll/process-batch.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { PayrollJobHandler } from '@/services/PayrollBackgroundJob/PayrollJobHandler';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'];
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { periodYearMonth } = req.body;

    if (!periodYearMonth) {
      return res.status(400).json({ error: 'Period is required' });
    }

    // Create processing session
    const session = await prisma.payrollProcessingSession.create({
      data: {
        periodYearMonth,
        status: 'processing',
        totalEmployees: 0,
        processedCount: 0,
      },
    });

    // Start background processing
    const jobHandler = new PayrollJobHandler();
    await jobHandler.processBatch(session.id, periodYearMonth);

    return res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('Error starting batch process:', error);
    return res.status(500).json({ error: 'Failed to start batch process' });
  }
}

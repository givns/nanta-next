// pages/api/admin/payroll/process-status.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'];
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { period } = req.query;

    if (!period) {
      res.write(`data: ${JSON.stringify({ error: 'Period is required' })}\n\n`);
      res.end();
      return;
    }

    // Poll for status updates
    const interval = setInterval(async () => {
      try {
        const session = await prisma.payrollProcessingSession.findFirst({
          where: {
            periodYearMonth: period as string,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        if (!session) {
          clearInterval(interval);
          res.write(
            `data: ${JSON.stringify({ error: 'Session not found' })}\n\n`,
          );
          res.end();
          return;
        }

        res.write(
          `data: ${JSON.stringify({
            status: session.status,
            totalEmployees: session.totalEmployees,
            processedCount: session.processedCount,
            error: session.error,
          })}\n\n`,
        );

        if (session.status === 'completed' || session.status === 'error') {
          clearInterval(interval);
          res.end();
        }
      } catch (error) {
        clearInterval(interval);
        res.write(
          `data: ${JSON.stringify({ error: 'Failed to fetch status' })}\n\n`,
        );
        res.end();
      }
    }, 1000);

    // Clean up on client disconnect
    res.on('close', () => {
      clearInterval(interval);
    });
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`,
    );
    res.end();
  }
}

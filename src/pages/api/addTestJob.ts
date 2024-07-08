import type { NextApiRequest, NextApiResponse } from 'next';
import getRegistrationQueue from '../../lib/queue';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    console.log('Getting registration queue...');
    const queue = getRegistrationQueue();
    console.log('Queue obtained, adding job...');
    const job = await queue.add({
      testData: 'This is a test job',
      timestamp: new Date().toISOString(),
    });

    console.log(`Test job added with ID: ${job.id}`);
    res
      .status(202)
      .json({ message: 'Test job queued successfully', jobId: job.id });
  } catch (error: any) {
    console.error('Error adding test job:', error);
    res
      .status(500)
      .json({ message: 'Error adding test job', error: error.message });
  }
}

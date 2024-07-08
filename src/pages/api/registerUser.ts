import { NextApiRequest, NextApiResponse } from 'next';
import getRegistrationQueue from '../../lib/queue';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    lineUserId,
    name,
    nickname,
    department,
    profilePictureUrl,
    employeeId,
  } = req.body;

  if (!lineUserId || !name || !nickname || !employeeId || !department) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const registrationQueue = getRegistrationQueue();
    const job = await registrationQueue.add({
      lineUserId,
      employeeId,
      name,
      nickname,
      department,
      profilePictureUrl,
    });

    console.log('Job added successfully, ID:', job.id);
    res.status(202).json({
      success: true,
      jobId: job.id,
      message: 'Registration job queued',
    });
  } catch (error: any) {
    console.error('Error in registration process:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

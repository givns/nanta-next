import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/utils/db';
import LeaveRequest from '@/models/LeaveRequest';

export default async (req: NextApiRequest, res: NextApiResponse) => {
  await connectDB();

  const { requestId } = req.body;

  try {
    const leaveRequest = await LeaveRequest.findById(requestId);
    if (!leaveRequest) {
      res.status(404).send('Leave request not found');
      return;
    }

    leaveRequest.status = 'approved';
    await leaveRequest.save();

    res.status(200).send('Leave request approved');
  } catch (error) {
    console.error('Error approving leave request:', error);
    res.status(500).send('Internal Server Error');
  }
};
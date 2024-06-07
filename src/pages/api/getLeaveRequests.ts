import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/utils/db';
import LeaveRequest from '@/models/LeaveRequest';

export default async (req: NextApiRequest, res: NextApiResponse) => {
  await connectDB();

  try {
    const leaveRequests = await LeaveRequest.find({});
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).send('Internal Server Error');
  }
};
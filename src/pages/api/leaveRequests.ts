import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/utils/db';
import LeaveRequest from '@/models/LeaveRequest';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await connectDB();

  if (req.method === 'POST') {
    try {
      const leaveRequest = new LeaveRequest(req.body);
      await leaveRequest.save();
      
      // Notify admins via Flex message
      // (Flex message code not shown here)
      
      res.status(201).json({ message: 'Leave request submitted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error submitting leave request', error });
    }
  } else if (req.method === 'GET') {
    try {
      const requests = await LeaveRequest.find();
      res.status(200).json(requests);
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving leave requests', error });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
};

export default handler;
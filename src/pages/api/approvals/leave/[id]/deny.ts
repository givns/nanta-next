import type { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '../../../../../lib/mongodb';
import LeaveRequest from '../../../../../models/LeaveRequest';
import { authenticateUser } from '../../../../../utils/authMiddleware';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await connectToDatabase();

  const { id } = req.query;

  try {
    const leaveRequest = await LeaveRequest.findById(id);

    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    leaveRequest.status = 'denied';
    await leaveRequest.save();

    res.status(200).json({ success: true, data: leaveRequest });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, message: error.message });
    } else {
      res.status(400).json({ success: false, message: 'Unknown error' });
    }
  }
};

export default async (req: NextApiRequest, res: NextApiResponse) => {
  await authenticateUser(req, res, () => handler(req, res));
};
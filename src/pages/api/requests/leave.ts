import type { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '../../../lib/mongodb';
import LeaveRequest, { ILeaveRequest } from '../../../models/LeaveRequest';
import { authenticateUser } from '../../../utils/authMiddleware';
import { IUser } from '../../../models/User';

interface NextApiRequestWithUser extends NextApiRequest {
  user?: IUser;
}

const handler = async (req: NextApiRequestWithUser, res: NextApiResponse) => {
  const { method } = req;

  await connectToDatabase();

  switch (method) {
    case 'POST':
      try {
        console.log('Creating leave request');
        const userId = req.user?.lineUserId;
        if (!userId) {
          throw new Error('User ID is missing in request');
        }

        const leaveRequest: ILeaveRequest = await LeaveRequest.create({
          ...req.body,
          userId: userId, // Use the userId from the request object
        });

        console.log('Leave request created');
        return res.status(201).json({ success: true, data: leaveRequest });
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error creating leave request', error.message);
          return res.status(400).json({ success: false, error: error.message });
        } else {
          console.error('Unknown error creating leave request', error);
          return res.status(400).json({ success: false, error: 'Unknown error' });
        }
      }
    case 'GET':
      try {
        console.log('Fetching leave requests');
        const leaveRequests = await LeaveRequest.find({});
        return res.status(200).json({ success: true, data: leaveRequests });
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error fetching leave requests', error.message);
          return res.status(400).json({ success: false, error: error.message });
        } else {
          console.error('Unknown error fetching leave requests', error);
          return res.status(400).json({ success: false, error: 'Unknown error' });
        }
      }
    default:
      console.log('Invalid method');
      return res.status(400).json({ success: false, message: 'Invalid method' });
  }
};

export default async (req: NextApiRequest, res: NextApiResponse) => {
  await authenticateUser(req, res, () => handler(req as NextApiRequestWithUser, res));
};
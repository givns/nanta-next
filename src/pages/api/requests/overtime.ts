import type { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '../../../lib/mongodb';
import OvertimeRequest, { IOvertimeRequest } from '../../../models/OvertimeRequest';
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
        console.log('Creating overtime request');
        const userId = req.user?.lineUserId;
        if (!userId) {
          throw new Error('User ID is missing in request');
        }

        const overtimeRequest: IOvertimeRequest = await OvertimeRequest.create({
          ...req.body,
          userId: userId, // Use the userId from the request object
        });

        console.log('Overtime request created');
        return res.status(201).json({ success: true, data: overtimeRequest });
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error creating overtime request', error.message);
          return res.status(400).json({ success: false, error: error.message });
        } else {
          console.error('Unknown error creating overtime request', error);
          return res.status(400).json({ success: false, error: 'Unknown error' });
        }
      }
    case 'GET':
      try {
        console.log('Fetching overtime requests');
        const overtimeRequests = await OvertimeRequest.find({});
        return res.status(200).json({ success: true, data: overtimeRequests });
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error fetching overtime requests', error.message);
          return res.status(400).json({ success: false, error: error.message });
        } else {
          console.error('Unknown error fetching overtime requests', error);
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
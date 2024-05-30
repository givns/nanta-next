import { NextApiRequest, NextApiResponse } from 'next';
import User, { IUser } from '../models/User';
import connectToDatabase from '../lib/mongodb';

export const authenticateUser = async (req: NextApiRequest, res: NextApiResponse, next: Function) => {
  try {
    await connectToDatabase();

    const userId = req.headers['user-id'] as string;
    console.log(`User ID from header: ${userId}`);

    if (!userId) {
      console.log('Unauthorized: No user ID provided');
      return res.status(401).json({ message: 'Unauthorized: No user ID provided' });
    }

    const user = await User.findOne({ lineUserId: userId }).lean() as IUser;

    if (!user) {
      console.log('Unauthorized: User not found');
      return res.status(401).json({ message: 'Unauthorized: User not found' });
    }

    console.log(`Authenticated user: ${user.name}`);
    (req as any).user = user; // Attach the user to the request object
    return next(); // Call the next function to continue to the handler
  } catch (error) {
    console.error('Authentication error', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
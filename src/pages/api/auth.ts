import type { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '../../lib/mongodb';
import User, { IUser } from '../../models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  await connectToDatabase();

  switch (method) {
    case 'POST':
      try {
        const { userId, displayName, pictureUrl } = req.body;
        let user: IUser | null = await User.findOne({ lineId: userId });

        if (!user) {
          user = await User.create({
            name: displayName,
            pictureUrl,
            lineId: userId,
            role: 'general',
          });
        }

        res.status(201).json({ success: true, data: user });
      } catch (error) {
        res.status(400).json({ success: false, error });
      }
      break;
    default:
      res.status(400).json({ success: false });
      break;
  }
}
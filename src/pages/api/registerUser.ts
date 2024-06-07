import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/utils/db';
import User from '@/models/User';

const registerUser = async (req: NextApiRequest, res: NextApiResponse) => {
  await connectDB();

  const { userId, name, nickname, department, employeeNumber } = req.body;

  if (!userId || !name || !nickname || !department || !employeeNumber) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    let user = await User.findOne({ lineUserId: userId });

    if (user) {
      return res.status(400).json({ message: 'User already registered' });
    }

    user = new User({
      lineUserId: userId,
      name,
      nickname,
      department,
      employeeNumber,
      role: 'general',
    });

    await user.save();
    res.status(200).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error });
  }
};

export default registerUser;
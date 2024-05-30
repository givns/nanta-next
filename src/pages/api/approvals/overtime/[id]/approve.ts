import type { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '../../../../../lib/mongodb';
import OvertimeRequest from '../../../../../models/OvertimeRequest';
import { authenticateUser } from '../../../../../utils/authMiddleware';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await connectToDatabase();

  const { id } = req.query;

  try {
    const overtimeRequest = await OvertimeRequest.findById(id);

    if (!overtimeRequest) {
      return res.status(404).json({ message: 'Overtime request not found' });
    }

    overtimeRequest.status = 'approved';
    await overtimeRequest.save();

    res.status(200).json({ success: true, data: overtimeRequest });
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
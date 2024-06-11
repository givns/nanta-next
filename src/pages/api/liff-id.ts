import { NextApiRequest, NextApiResponse } from 'next';
import dotenv from 'dotenv';

dotenv.config();

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ liffId: process.env.LIFF_ID_REGISTER });
};

export default handler;

// pages/api/server-time.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentTime, formatDateTime } from '../../utils/dateUtils';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const now = getCurrentTime();
  res
    .status(200)
    .json({ serverTime: formatDateTime(now, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX") });
}

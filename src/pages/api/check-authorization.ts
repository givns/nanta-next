// pages/api/check-authorization.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getUserRole } from '../../utils/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userRole = await getUserRole(lineUserId);
  const isAuthorized = userRole === 'ADMIN' || userRole === 'SUPERADMIN';

  res.status(200).json({ isAuthorized });
}

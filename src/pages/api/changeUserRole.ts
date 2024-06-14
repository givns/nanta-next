import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { userId, newRole } = req.body;

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: newRole },
      });
      res.status(200).json(user);
    } catch (error) {
      console.error('Error changing user role:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

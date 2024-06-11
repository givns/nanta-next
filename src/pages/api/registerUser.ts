import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { lineUserId, name, nickname, department, employeeNumber } = req.body;

    try {
      // Check if the user already exists
      let user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      // If user does not exist, create a new one
      if (!user) {
        user = await prisma.user.create({
          data: {
            lineUserId,
            name,
            nickname,
            department,
            employeeNumber,
            role: 'general',
          },
        });
      }

      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

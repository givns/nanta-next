// pages/api/holidays/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.query;
  const { name, localName } = req.body;

  try {
    const updatedHoliday = await prisma.holiday.update({
      where: { id: String(id) },
      data: {
        name,
        localName,
      },
    });

    res.status(200).json(updatedHoliday);
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({ message: 'Failed to update holiday' });
  }
}

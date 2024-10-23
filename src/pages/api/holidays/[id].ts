import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const { name, localName } = req.body;

    try {
      const updatedHoliday = await prisma.holiday.update({
        where: { id: String(id) }, // Ensure 'id' is a string
        data: { name, localName },
      });
      res.status(200).json(updatedHoliday);
    } catch (error) {
      console.error('Error updating holiday:', error);
      res.status(500).json({ error: 'Failed to update holiday' });
    }
  } else {
    res.setHeader('Allow', ['PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

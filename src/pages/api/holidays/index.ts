// /pages/api/holidays/index.ts

import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { date, name, localName } = req.body;

    if (!date || !name || !localName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const newHoliday = await prisma.holiday.create({
        data: {
          date: new Date(date), // Ensure date is properly formatted
          name,
          localName,
        },
      });
      res.status(201).json(newHoliday);
    } catch (error) {
      console.error('Error creating holiday:', error);
      res.status(500).json({ error: 'Failed to create holiday' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

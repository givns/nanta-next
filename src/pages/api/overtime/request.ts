// pages/api/overtime/request.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId, date, startTime, endTime, reason } = req.body;

  if (!lineUserId || !date || !startTime || !endTime || !reason) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // First, find the user by lineUserId
    const user = await prisma.user.findUnique({
      where: { lineUserId: lineUserId },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create the overtime request
    const overtimeRequest = await prisma.overtimeRequest.create({
      data: {
        user: { connect: { id: user.id } }, // Connect the user to the overtime request
        date: new Date(date),
        startTime,
        endTime,
        reason,
        status: 'pending',
      },
    });

    res.status(201).json(overtimeRequest);
  } catch (error) {
    console.error('Error creating overtime request:', error);
    res
      .status(500)
      .json({
        message: 'Error creating overtime request',
        error: error.message,
      });
  }
}

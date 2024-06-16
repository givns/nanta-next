import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { sendLeaveRequestNotification } from '../../../utils/sendNotifications';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { userId, leaveType, leaveFormat, reason, startDate, endDate } =
    req.body;

  if (
    !userId ||
    !leaveType ||
    !leaveFormat ||
    !reason ||
    !startDate ||
    !endDate
  ) {
    return res
      .status(400)
      .json({ success: false, error: 'Missing required fields' });
  }

  try {
    const newLeaveRequest = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveType,
        leaveFormat,
        reason,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'pending',
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user) {
      await sendLeaveRequestNotification(user, newLeaveRequest);
    }

    return res.status(201).json({ success: true, data: newLeaveRequest });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

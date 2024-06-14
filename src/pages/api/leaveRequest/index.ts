import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { sendLeaveRequestNotification } from '../../../utils/sendLeaveRequestNotification';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { userId, leaveType, leaveFormat, startDate, endDate, reason } =
      req.body;

    try {
      // Create a new leave request
      const leaveRequest = await prisma.leaveRequest.create({
        data: {
          userId,
          leaveType,
          leaveFormat,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          reason,
          status: 'Pending',
        },
      });

      // Fetch the user details
      const user = await prisma.user.findUnique({
        where: { lineUserId: userId },
      });

      if (user) {
        // Send a notification to the admin for approval
        await sendLeaveRequestNotification(user, leaveRequest);
      }

      res.status(201).json({ success: true, data: leaveRequest });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

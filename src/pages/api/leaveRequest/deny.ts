import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { sendLeaveRequestNotification } from '../../../utils/sendLeaveRequestNotification';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { requestId, denialReason } = req.body;

    try {
      // Update the leave request status
      const leaveRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'Denied', denialReason },
      });

      // Fetch the user details
      const user = await prisma.user.findUnique({
        where: { id: leaveRequest.userId },
      });

      if (user) {
        // Send a notification to the user
        await sendLeaveRequestNotification(user, leaveRequest);
      }

      res.status(200).json({ success: true, data: leaveRequest });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

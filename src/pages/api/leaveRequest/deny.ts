import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { sendDenyNotification } from '../../../utils/sendNotifications';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { requestId, approverId, denialReason } = req.body;

    if (!requestId || !approverId || !denialReason) {
      return res
        .status(400)
        .json({
          error:
            'Missing required fields: requestId, approverId, or denialReason',
        });
    }

    try {
      const leaveRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'denied', approverId, denialReason },
      });

      const user = await prisma.user.findUnique({
        where: { id: leaveRequest.userId },
      });

      if (user) {
        await sendDenyNotification(user, leaveRequest, denialReason);
      }

      return res.status(200).json(leaveRequest);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  } else {
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { sendApproveNotification } from '../../../utils/sendNotifications';

export const handleApproveLeaveRequest = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const { requestId, approverId } = req.body;

  if (!requestId || !approverId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'approved', approverId },
    });

    const user = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    if (user) {
      await sendApproveNotification(user, leaveRequest);
    }

    res.status(200).json(leaveRequest);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

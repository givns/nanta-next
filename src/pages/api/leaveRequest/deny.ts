import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import { sendDenyNotification } from '../../../utils/sendNotifications';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { action, requestId, lineUserId, denialReason, approverId } =
      req.body;

    // Log received values
    console.log(
      `Received action: ${action}, requestId: ${requestId}, lineUserId: ${lineUserId}, denialReason: ${denialReason}, approverId: ${approverId}`,
    );

    if (
      action !== 'deny' ||
      !requestId ||
      !lineUserId ||
      !denialReason ||
      !approverId
    ) {
      console.log('Missing required parameters:', {
        action,
        requestId,
        lineUserId,
        denialReason,
        approverId,
      });
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    try {
      console.log(
        `Denying leave request: ${requestId} by user: ${lineUserId} with reason: ${denialReason}`,
      );

      // Check if the request has already been approved or denied
      const existingRequest = await prisma.leaveRequest.findUnique({
        where: { id: requestId },
      });

      if (!existingRequest || existingRequest.status !== 'Pending') {
        console.log(
          'Leave request has already been processed:',
          existingRequest,
        );
        return res
          .status(400)
          .json({ error: 'Leave request has already been processed.' });
      }

      const leaveRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'Denied', approverId, denialReason },
      });
      console.log('Leave request denied:', leaveRequest);

      const user = await prisma.user.findUnique({
        where: { id: leaveRequest.userId },
      });

      const admin = await prisma.user.findUnique({
        where: { lineUserId: approverId },
      });

      if (user && admin) {
        console.log('Sending denial notifications to user and admins');
        await sendDenyNotification(user, leaveRequest, denialReason, admin);
        console.log('Denial notifications sent successfully');
      } else {
        console.error('User or admin not found:', { user, admin });
        return res.status(404).json({ error: 'User or admin not found.' });
      }

      res.status(200).json({ success: true, data: leaveRequest });
    } catch (error: any) {
      console.error('Error denying leave request:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

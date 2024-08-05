import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import { finalizeDenial, RequestType } from '../../../utils/requestHandlers';
import { sendDenyNotification } from '../../../utils/sendNotifications';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { requestId, lineUserId, denialReason, requestType } = req.body;

    if (!requestType || !['leave', 'overtime'].includes(requestType)) {
      res.status(400).json({ success: false, error: 'Invalid request type' });
      return;
    }

    try {
      console.log(
        `Denying ${requestType} request: ${requestId} by user: ${lineUserId}`,
      );

      // Check if the request has already been approved or denied
      const existingRequest =
        requestType === 'leave'
          ? await prisma.leaveRequest.findUnique({ where: { id: requestId } })
          : await prisma.overtimeRequest.findUnique({
              where: { id: requestId },
            });

      if (!existingRequest || existingRequest.status !== 'Pending') {
        console.log(
          `${requestType.charAt(0).toUpperCase() + requestType.slice(1)} request has already been processed:`,
          existingRequest,
        );
        return res.status(400).json({
          error: `${requestType.charAt(0).toUpperCase() + requestType.slice(1)} request has already been processed.`,
        });
      }

      const deniedRequest = await finalizeDenial(
        requestId,
        lineUserId,
        denialReason,
        requestType as RequestType,
      );
      console.log(
        `${requestType.charAt(0).toUpperCase() + requestType.slice(1)} request denied:`,
        deniedRequest,
      );

      const user = await prisma.user.findUnique({
        where: { id: deniedRequest.employeeId },
      });

      const admin = await prisma.user.findUnique({
        where: { lineUserId },
      });

      if (user && admin) {
        console.log('Sending denial notifications to user and admins');
        await sendDenyNotification(
          user,
          deniedRequest,
          admin,
          denialReason,
          requestType,
        );
        console.log('Denial notifications sent successfully');
      } else {
        console.error('User or admin not found:', { user, admin });
        return res.status(404).json({ error: 'User or admin not found.' });
      }

      res.status(200).json({ success: true, data: deniedRequest });
    } catch (error: any) {
      console.error(`Error denying ${requestType} request:`, error.message);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

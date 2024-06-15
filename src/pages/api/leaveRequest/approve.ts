import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { Client, FlexMessage } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const sendApproveNotification = async (user: any, leaveRequest: any) => {
  const message: FlexMessage = {
    type: 'flex',
    altText: 'Leave Request Approved',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'คำขอการลาของคุณ',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#00FF00',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'ประเภทการลา',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: leaveRequest.leaveType,
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'วันที่',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: `${leaveRequest.startDate.toISOString().split('T')[0]} - ${leaveRequest.endDate.toISOString().split('T')[0]}`,
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'สาเหตุ',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: leaveRequest.reason,
                wrap: true,
                flex: 1,
              },
            ],
          },
        ],
      },
    },
  };

  await client.pushMessage(user.lineUserId, message);
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { requestId, approverId } = req.body;

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
  } else {
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

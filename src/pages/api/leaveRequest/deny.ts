import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';
import { Client, FlexMessage } from '@line/bot-sdk';
import { sendLeaveRequestNotification } from '../../../utils/sendLeaveRequestNotification';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const sendDenyNotification = async (
  user: any,
  leaveRequest: any,
  denialReason: string,
) => {
  const message: FlexMessage = {
    type: 'flex',
    altText: 'Leave Request Denied',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'คำขอการลาถูกปฏิเสธ',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#FF0000',
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
                text: `${new Date(leaveRequest.startDate).toLocaleDateString(
                  'th-TH',
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  },
                )} - ${new Date(leaveRequest.endDate).toLocaleDateString(
                  'th-TH',
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  },
                )}`,
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
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'เหตุผลที่ถูกปฏิเสธ',
                weight: 'bold',
                flex: 0,
              },
              {
                type: 'text',
                text: denialReason,
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
    const { requestId, approverId, denialReason } = req.body;

    if (!requestId || !approverId || !denialReason) {
      return res
        .status(400)
        .json({
          success: false,
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

      res.status(200).json(leaveRequest);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import { finalizeDenial } from '../../../utils/leaveRequestHandlers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { requestId, lineUserId, denialReason } = req.body;

    try {
      const updatedLeaveRequest = await finalizeDenial(
        requestId,
        lineUserId,
        denialReason,
      );
      res.status(200).json({
        success: true,
        message: 'Leave request denied successfully',
        data: updatedLeaveRequest,
      });
    } catch (error: any) {
      console.error('Error denying leave request:', error.message);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

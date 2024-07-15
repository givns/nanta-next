import { NextApiRequest, NextApiResponse } from 'next';
import { finalizeDenial } from '../../../utils/requestHandlers';
import { RequestType } from '../../../utils/requestHandlers';

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
      const updatedRequest = await finalizeDenial(
        requestId,
        lineUserId,
        denialReason,
        requestType as RequestType,
      );
      res.status(200).json({
        success: true,
        message: `${requestType} request denied successfully`,
        data: updatedRequest,
      });
    } catch (error: any) {
      console.error(`Error denying ${requestType} request:`, error.message);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

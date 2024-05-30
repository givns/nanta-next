import type { NextApiRequest, NextApiResponse } from 'next';
import { middleware, MiddlewareConfig } from '@line/bot-sdk';

const config: MiddlewareConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN as string,
  channelSecret: process.env.LINE_CHANNEL_SECRET as string,
};

const webhookMiddleware = middleware(config);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    // Handle webhook events here
    console.log('Webhook event received:', req.body.events);
    res.status(200).send('OK');
  } else {
    res.status(405).send('Method Not Allowed');
  }
};

export default function (req: NextApiRequest, res: NextApiResponse) {
  webhookMiddleware(req, res, (err: any) => {
    if (err) {
      res.status(500).send(err.message);
    } else {
      handler(req, res);
    }
  });
}
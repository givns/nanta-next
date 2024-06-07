import { NextApiRequest, NextApiResponse } from 'next';
import { middleware, MiddlewareConfig, WebhookEvent, Client, ClientConfig } from '@line/bot-sdk';
import dotenv from 'dotenv';
import getRawBody from 'raw-body';
import connectDB from '@/utils/db';
import User from '@/models/User';
import { linkRichMenuToUser, createAndAssignRichMenu } from '@/utils/richMenus';

dotenv.config({ path: '.env.local' });

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

if (!channelSecret || !channelAccessToken) {
  throw new Error('LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN must be defined in .env.local');
}

// LINE bot client configuration
const clientConfig: ClientConfig = {
  channelAccessToken,
};

const client = new Client(clientConfig);

// Middleware configuration
const middlewareConfig: MiddlewareConfig = {
  channelSecret,
};

export const config = {
  api: {
    bodyParser: false, // Disallow body parsing to handle raw body manually
  },
};

const handler = async (event: WebhookEvent) => {
  await connectDB();

  if (event.type === 'follow') {
    const userId = event.source.userId;
    if (userId) {
      let user = await User.findOne({ lineUserId: userId });

      if (!user) {
        try {
          // Link pre-created register rich menu to the new user
          const registerRichMenuId = 'richmenu-c951b204c418e310c197980352bb36d0';
          await linkRichMenuToUser(registerRichMenuId, userId);
          console.log('Register Rich menu linked to user:', userId);
        } catch (error: any) { // Explicitly typing error as any
          console.error('Error displaying register rich menu:', error.message, error.stack);
        }
      } else {
        try {
          // Check user's department and create & assign the appropriate rich menu
          const department = user.department;
          await createAndAssignRichMenu(department, userId);
        } catch (error: any) { // Explicitly typing error as any
          console.error('Error linking rich menu based on department:', error.message, error.stack);
        }
      }
    } else {
      console.error('User ID not found in event:', event);
    }
  } else {
    console.error('Unhandled event type:', event.type);
  }
};

const lineMiddleware = middleware(middlewareConfig);

export default async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const rawBodyBuffer = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
    });

    const rawBody = rawBodyBuffer.toString('utf-8');
    console.log('Raw body:', rawBody);

    req.body = JSON.parse(rawBody);

    lineMiddleware(req, res, () => handler(req.body.events[0]));
    res.status(200).send('OK');
  } catch (err) {
    console.error('Error in middleware:', err);
    res.status(500).send('Internal Server Error');
  }
};
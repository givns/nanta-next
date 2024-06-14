import { NextApiRequest, NextApiResponse } from 'next';
import { WebhookEvent, Client, ClientConfig } from '@line/bot-sdk';
import dotenv from 'dotenv';
import getRawBody from 'raw-body';
import prisma from '../../utils/db';

dotenv.config({ path: './.env.local' });

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

if (!channelSecret || !channelAccessToken) {
  throw new Error(
    'LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN must be defined in .env.local',
  );
}

// LINE bot client configuration
const clientConfig: ClientConfig = {
  channelAccessToken,
};

const client = new Client(clientConfig);

export const config = {
  api: {
    bodyParser: false, // Disallow body parsing to handle raw body manually
  },
};

const handler = async (event: WebhookEvent) => {
  if (!event) {
    console.error('Event is undefined');
    return;
  }

  console.log('Event received:', event);

  if (event.type === 'follow') {
    const userId = event.source.userId;
    console.log('Follow event for user ID:', userId);

    if (userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { lineUserId: userId },
        });

        // Determine the role and rich menu ID
        let role = 'general'; // Default role

        // Check if this is the first user and assign super admin role
        const userCount = await prisma.user.count();
        if (userCount === 0) {
          role = 'superadmin';
        }

        let richMenuId;
        if (!user) {
          // If user does not exist, create a new one
          await prisma.user.create({
            data: {
              lineUserId: userId,
              name: '', // Placeholder name
              nickname: '', // Placeholder nickname
              department: '', // Placeholder department
              role,
            },
          });

          richMenuId = 'richmenu-1d20c92a5e0ca5c5c12cc4cb6fda1caa'; // Register Rich Menu
        } else {
          // Determine the appropriate rich menu based on role and department
          if (role === 'superadmin') {
            richMenuId = 'richmenu-5610259c0139fc6a9d6475b628986fcf'; // Super Admin Rich Menu
          } else if (role === 'admin') {
            richMenuId = 'richmenu-2e10f099c17149de5386d2cf6f936051'; // Admin Rich Menu
          } else if (
            ['ฝ่ายขนส่ง', 'ฝ่ายปฏิบัติการ'].includes(user.department)
          ) {
            richMenuId = 'richmenu-d07da0e5fa90760bc50f7b2deec89ca2'; // Special User Rich Menu
          } else {
            richMenuId = 'richmenu-581e59c118fd514a45fc01d6f301138e'; // General User Rich Menu
          }
        }

        // Link the rich menu to the user
        await client.linkRichMenuToUser(userId, richMenuId);
        console.log(`Rich menu linked to user ${userId}: ${richMenuId}`);
      } catch (error: any) {
        console.error(
          'Error processing follow event:',
          error.message,
          error.stack,
        );
      }
    } else {
      console.error('User ID not found in event:', event);
    }
  } else if (event.type === 'unfollow') {
    // Do nothing for unfollow events
    console.log('Unfollow event for user ID:', event.source.userId);
  } else {
    console.error('Unhandled event type:', event.type);
  }
};

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    // Handle the GET request from the LINE Developer Console
    return res.status(200).send('Webhook is set up and running!');
  }

  if (req.method === 'POST') {
    try {
      const rawBodyBuffer = await getRawBody(req, {
        length: req.headers['content-length'],
        limit: '1mb',
      });

      const rawBody = rawBodyBuffer.toString('utf-8');
      console.log('Raw body:', rawBody);

      req.body = JSON.parse(rawBody);

      if (!req.body.events || !Array.isArray(req.body.events)) {
        console.error('No events found in request body:', req.body);
        return res.status(400).send('No events found');
      }

      const event = req.body.events[0];
      await handler(event);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Error in middleware:', err);
      return res.status(500).send('Internal Server Error');
    }
  }

  // Return a 405 status for any method other than GET or POST
  return res.status(405).send('Method Not Allowed');
};

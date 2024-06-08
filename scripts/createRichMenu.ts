import { Client, RichMenu } from '@line/bot-sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_ID = process.env.LIFF_ID;

if (!channelAccessToken || !LIFF_ID) {
  throw new Error('LINE_CHANNEL_ACCESS_TOKEN and LIFF_ID must be defined in .env.local');
}

const client = new Client({
  channelAccessToken
});

const createRichMenu = async () => {
  const richMenu: RichMenu = {
    size: {
      width: 2500,
      height: 843
    },
    selected: true,
    name: "Register Menu",
    chatBarText: "Register",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 2500, height: 843 },
        action: { type: "uri", uri: `line://app/${LIFF_ID}/register` }
      }
    ]
  };

  try {
    const richMenuId = await client.createRichMenu(richMenu);
    console.log(`Rich menu created with ID: ${richMenuId}`);

    // Upload the image for the rich menu
    const imagePath = path.resolve(__dirname, '../public/images/richmenus/Register.jpeg');
    const imageBuffer = fs.readFileSync(imagePath);

    await axios.post(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, imageBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Length': imageBuffer.length
      }
    });

    console.log('Rich menu image uploaded successfully');
    return richMenuId;
  } catch (error: any) {
    console.error('Error creating rich menu:', error.response ? error.response.data : error.message);
    throw error;
  }
};

const main = async () => {
  try {
    const richMenuId = await createRichMenu();
    console.log(`Rich menu successfully created and image uploaded with ID: ${richMenuId}`);
  } catch (error: any) {
    console.error('Error in main function:', error.message);
  }
};

main();
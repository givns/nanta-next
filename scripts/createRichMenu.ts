import { Client, RichMenu, URIAction } from '@line/bot-sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_URL = `https://liff.line.me/${process.env.LIFF_URL}`;

if (!channelAccessToken || !LIFF_URL) {
  throw new Error(
    'LINE_CHANNEL_ACCESS_TOKEN and LIFF_URL must be defined in .env.local',
  );
}

const client = new Client({
  channelAccessToken,
});

const createRichMenu = async (richMenu: RichMenu, imagePath: string) => {
  try {
    const richMenuId = await client.createRichMenu(richMenu);
    console.log(`Rich menu created with ID: ${richMenuId}`);

    // Upload the image for the rich menu
    const imageBuffer = fs.readFileSync(imagePath);

    const response = await axios.post(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      imageBuffer,
      {
        headers: {
          'Content-Type': 'image/jpeg',
          Authorization: `Bearer ${channelAccessToken}`,
          'Content-Length': imageBuffer.length,
        },
      },
    );

    console.log('Rich menu image uploaded successfully', response.data);
    return richMenuId;
  } catch (error: any) {
    console.error(
      'Error creating rich menu:',
      error.response ? error.response.data : error.message,
    );
    throw error;
  }
};

const registerRichMenu: RichMenu = {
  size: {
    width: 2500,
    height: 843,
  },
  selected: true,
  name: 'Register Menu',
  chatBarText: 'Register',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 843 },
      action: { type: 'uri', uri: `${LIFF_URL}?path=/register` } as URIAction, // Slot A
    },
  ],
};

const generalUserRichMenu: RichMenu = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: true,
  name: 'General User Menu',
  chatBarText: 'Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/holiday-calendar`,
      } as URIAction, // Slot A
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/overtime-request`,
      } as URIAction, // Slot B
    },
    {
      bounds: { x: 0, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-balance`,
      } as URIAction, // Slot C
    },
    {
      bounds: { x: 1250, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction, // Slot D
    },
  ],
};
const specialUserRichMenu: RichMenu = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: true,
  name: 'Special User Menu',
  chatBarText: 'Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/Check-in`,
      } as URIAction, // Slot A
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/overtime-request`,
      } as URIAction, // Slot B
    },
    {
      bounds: { x: 0, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/leave-balance`,
      } as URIAction, // Slot C
    },
    {
      bounds: { x: 1250, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/leave-request`,
      } as URIAction, // Slot D
    },
  ],
};

const adminRichMenu: RichMenu = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: true,
  name: 'Admin Menu',
  chatBarText: 'Admin Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/approval-dashboard`,
      } as URIAction, // Slot A
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/holiday-calendar`,
      } as URIAction, // Slot B
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/leave-balance`,
      } as URIAction, // Slot C
    },
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/leave-request`,
      } as URIAction, // Slot D
    },
  ],
};

const superAdminRichMenu: RichMenu = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: true,
  name: 'Super Admin Menu',
  chatBarText: 'Super Admin',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/approval-dashboard`,
      } as URIAction, // Slot A
    },
    {
      bounds: { x: 833, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/approval-dashboard`,
      } as URIAction, // Slot B
    },
    {
      bounds: { x: 1666, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/admin-dashboard`,
      } as URIAction, // Slot C
    },
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/holiday-calendar`,
      } as URIAction, // Slot D
    },
    {
      bounds: { x: 833, y: 843, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/leave-balance`,
      } as URIAction, // Slot E
    },
    {
      bounds: { x: 1666, y: 843, width: 834, height: 843 },
      action: {
        type: 'uri',
        uri: `line://app/${LIFF_URL}?path=/leave-request`,
      } as URIAction, // Slot F
    },
  ],
};
const main = async () => {
  try {
    const registerRichMenuId = await createRichMenu(
      registerRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Register.jpeg'),
    );
    console.log(
      `Register rich menu successfully created and image uploaded with ID: ${registerRichMenuId}`,
    );

    const generalUserRichMenuId = await createRichMenu(
      generalUserRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/General.jpeg'),
    );
    console.log(
      `General user rich menu successfully created and image uploaded with ID: ${generalUserRichMenuId}`,
    );

    const specialUserRichMenuId = await createRichMenu(
      specialUserRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Special.jpeg'),
    );
    console.log(
      `Special user rich menu successfully created and image uploaded with ID: ${specialUserRichMenuId}`,
    );

    const adminRichMenuId = await createRichMenu(
      adminRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Admin.jpeg'),
    );
    console.log(
      `Admin rich menu successfully created and image uploaded with ID: ${adminRichMenuId}`,
    );

    const superAdminRichMenuId = await createRichMenu(
      superAdminRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/SuperAdmin.jpeg'),
    );
    console.log(
      `Super Admin rich menu successfully created and image uploaded with ID: ${superAdminRichMenuId}`,
    );
  } catch (error: any) {
    console.error('Error in main function:', error.message);
  }
};

main();

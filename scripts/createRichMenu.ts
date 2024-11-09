import { Client, RichMenu, URIAction, PostbackAction } from '@line/bot-sdk';
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

// Register Rich Menu (unchanged)
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
      action: { type: 'uri', uri: `${LIFF_URL}?path=/register` } as URIAction,
    },
  ],
};

// General/Sales Rich Menu (3 slots)
const generalRichMenu: RichMenu = {
  size: {
    width: 2500,
    height: 843,
  },
  selected: true,
  name: 'General User Menu',
  chatBarText: 'Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/check-in-router`,
      } as URIAction, // Slot A
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction, // Slot B
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/user-dashboard`,
      } as URIAction, // Slot C
    },
  ],
};

// Admin Rich Menu Page 1
const adminRichMenu1: RichMenu = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: true,
  name: 'Admin Menu 1',
  chatBarText: 'Admin Menu 1',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/check-in-router`,
      } as URIAction,
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/user-dashboard`,
      } as URIAction,
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction,
    },
    {
      bounds: { x: 0, y: 843, width: 2500, height: 843 },
      action: {
        type: 'postback',
        data: 'richmenu-alias-change:admin-menu-2',
      } as PostbackAction,
    },
  ],
};

// Admin Rich Menu Page 2 - Additional Functions and Quick Access
const adminRichMenu2: RichMenu = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: false,
  name: 'Admin Menu 2',
  chatBarText: 'Admin Menu 2',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}/admin/payroll`,
      } as URIAction, // Daily Records
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}/admin/employees`,
      } as URIAction, // Overtime Requests
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}/overtime-request`,
      } as URIAction, // Holiday Calendar
    },
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}/admin/attendance/daily`,
      } as URIAction, // Settings
    },
    {
      bounds: { x: 833, y: 843, width: 834, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}/admin/approvals`,
      } as URIAction, // Leave Requests
    },
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: {
        type: 'postback',
        data: 'richmenu-alias-change:admin-menu-1',
      } as PostbackAction, // Switch back to Menu 1
    },
  ],
};

// Manager Rich Menu
const managerRichMenu: RichMenu = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: true,
  name: 'Manager Menu',
  chatBarText: 'Manager Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/check-in-router`,
      } as URIAction,
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/overtime-request`,
      } as URIAction,
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction,
    },
    {
      bounds: { x: 0, y: 843, width: 2500, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/user-dashboard`,
      } as URIAction,
    },
  ],
};

// Driver Rich Menu
const driverRichMenu: RichMenu = {
  size: {
    width: 2500,
    height: 843,
  },
  selected: true,
  name: 'Driver Menu',
  chatBarText: 'Driver Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/check-in-router`,
      } as URIAction,
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/checkpoint`,
      } as URIAction,
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction,
    },
    {
      bounds: { x: 0, y: 843, width: 2500, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/user-dashboard`,
      } as URIAction,
    },
  ],
};

const main = async () => {
  try {
    // Create all rich menus
    const registerRichMenuId = await createRichMenu(
      registerRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Register.jpeg'),
    );

    const generalRichMenuId = await createRichMenu(
      generalRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/General.jpeg'),
    );

    const adminRichMenu1Id = await createRichMenu(
      adminRichMenu1,
      path.resolve(__dirname, '../public/images/richmenus/Admin1.jpeg'),
    );

    const adminRichMenu2Id = await createRichMenu(
      adminRichMenu2,
      path.resolve(__dirname, '../public/images/richmenus/Admin2.jpeg'),
    );

    const managerRichMenuId = await createRichMenu(
      managerRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Manager.jpeg'),
    );

    const driverRichMenuId = await createRichMenu(
      driverRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Driver.jpeg'),
    );

    // Create rich menu alias for admin menu switching
    await client.createRichMenuAlias(adminRichMenu1Id, 'admin-menu-1');
    await client.createRichMenuAlias(adminRichMenu2Id, 'admin-menu-2');

    console.log('Rich menu IDs:', {
      registerRichMenuId,
      generalRichMenuId,
      adminRichMenu1Id,
      adminRichMenu2Id,
      managerRichMenuId,
      driverRichMenuId,
    });
  } catch (error: any) {
    console.error('Error in main function:', error.message);
  }
};

export {
  registerRichMenu,
  generalRichMenu,
  adminRichMenu1,
  adminRichMenu2,
  managerRichMenu,
  driverRichMenu,
};

main();

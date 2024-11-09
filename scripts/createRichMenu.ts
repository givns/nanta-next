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
    height: 1686,
  },
  selected: true,
  name: 'General User Menu',
  chatBarText: 'Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 1686 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/check-in-router`,
      } as URIAction, // วันนี้มา (Whole left side)
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction, // วันนี้ลา (Top right)
    },
    {
      bounds: { x: 1250, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/user-dashboard`,
      } as URIAction, // ตรวจสอบข้อมูล (Bottom right)
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
  chatBarText: 'Admin',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/check-in-router`,
      } as URIAction, // วันนี้มา (Attendance)
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/user-dashboard`,
      } as URIAction, // ตรวจสอบข้อมูล (Check Information)
    },
    {
      bounds: { x: 0, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction, // วันนี้ลา (Leave Request)
    },
    {
      bounds: { x: 1250, y: 843, width: 1250, height: 843 },
      action: {
        type: 'postback',
        data: 'richmenu-alias-change:admin-menu-2',
      } as PostbackAction, // ถัดไป (Next)
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
  chatBarText: 'Admin',
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
  chatBarText: 'Manager',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/check-in-router`,
      } as URIAction,
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/overtime-request`,
      } as URIAction,
    },
    {
      bounds: { x: 0, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction,
    },
    {
      bounds: { x: 1250, y: 843, width: 1250, height: 843 },
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
    height: 1686,
  },
  selected: true,
  name: 'Driver Menu',
  chatBarText: 'Driver',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/check-in-router`,
      } as URIAction,
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/checkpoint`,
      } as URIAction,
    },
    {
      bounds: { x: 0, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/leave-request`,
      } as URIAction,
    },
    {
      bounds: { x: 1250, y: 843, width: 1250, height: 843 },
      action: {
        type: 'uri',
        uri: `${LIFF_URL}?path=/user-dashboard`,
      } as URIAction,
    },
  ],
};

const main = async () => {
  try {
    // Create rich menus first (your existing code for creating menus)
    console.log('Creating register rich menu...');
    const registerRichMenuId = await createRichMenu(
      registerRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Register.jpeg'),
    );

    console.log('Creating general rich menu...');
    const generalRichMenuId = await createRichMenu(
      generalRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/General.jpeg'),
    );

    console.log('Creating admin menu 1...');
    const adminRichMenu1Id = await createRichMenu(
      adminRichMenu1,
      path.resolve(__dirname, '../public/images/richmenus/Admin1.jpeg'),
    );

    console.log('Creating admin menu 2...');
    const adminRichMenu2Id = await createRichMenu(
      adminRichMenu2,
      path.resolve(__dirname, '../public/images/richmenus/Admin2.jpeg'),
    );

    console.log('Creating manager rich menu...');
    const managerRichMenuId = await createRichMenu(
      managerRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Manager.jpeg'),
    );

    console.log('Creating driver rich menu...');
    const driverRichMenuId = await createRichMenu(
      driverRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Driver.jpeg'),
    );

    // Handle alias creation with better error handling
    console.log('Setting up rich menu aliases...');

    // Function to handle alias creation/update
    const setupAlias = async (richMenuId: string, aliasId: string) => {
      try {
        // First try to delete existing alias if it exists
        try {
          console.log(`Checking for existing alias: ${aliasId}`);
          await client.deleteRichMenuAlias(aliasId);
          console.log(`Deleted existing alias: ${aliasId}`);
        } catch (deleteError) {
          // Ignore delete errors - alias might not exist
          console.log(`No existing alias found for: ${aliasId}`);
        }

        // Create new alias
        console.log(`Creating new alias: ${aliasId} for menu: ${richMenuId}`);
        await client.createRichMenuAlias(richMenuId, aliasId);
        console.log(`Successfully created alias: ${aliasId}`);
      } catch (error: any) {
        console.error(
          `Error handling alias ${aliasId}:`,
          error.response?.data || error.message,
        );
        throw error;
      }
    };

    // Set up aliases with delay between requests
    try {
      await setupAlias(adminRichMenu1Id, 'admin-menu-1');
      // Add small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await setupAlias(adminRichMenu2Id, 'admin-menu-2');
    } catch (aliasError) {
      console.error('Error in alias setup:', aliasError);
      console.log('Continuing without aliases...');
    }

    // Log success
    console.log('Successfully created rich menus. IDs:', {
      registerRichMenuId,
      generalRichMenuId,
      adminRichMenu1Id,
      adminRichMenu2Id,
      managerRichMenuId,
      driverRichMenuId,
    });

    // Try to get and display current aliases
    try {
      const aliases = await client.getRichMenuAliasList();
      console.log('Current rich menu aliases:', aliases);
    } catch (error: any) {
      console.log('Could not fetch current aliases:', error.message);
    }
  } catch (error: any) {
    console.error('Error in main function:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    process.exit(1);
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

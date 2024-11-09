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
  chatBarText: 'Admin Menu 1',
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
  chatBarText: 'Driver Menu',
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
    // Store all menu IDs
    const richMenuIds = {
      register: '',
      general: '',
      admin1: '',
      admin2: '',
      manager: '',
      driver: '',
    };

    // Create rich menus with error handling
    console.log('Creating register rich menu...');
    richMenuIds.register = await createRichMenu(
      registerRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Register.jpeg'),
    );

    console.log('Creating general rich menu...');
    richMenuIds.general = await createRichMenu(
      generalRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/General.jpeg'),
    );

    console.log('Creating admin menu 1...');
    richMenuIds.admin1 = await createRichMenu(
      adminRichMenu1,
      path.resolve(__dirname, '../public/images/richmenus/Admin1.jpeg'),
    );

    console.log('Creating admin menu 2...');
    richMenuIds.admin2 = await createRichMenu(
      adminRichMenu2,
      path.resolve(__dirname, '../public/images/richmenus/Admin2.jpeg'),
    );

    console.log('Creating manager rich menu...');
    richMenuIds.manager = await createRichMenu(
      managerRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Manager.jpeg'),
    );

    console.log('Creating driver rich menu...');
    richMenuIds.driver = await createRichMenu(
      driverRichMenu,
      path.resolve(__dirname, '../public/images/richmenus/Driver.jpeg'),
    );

    // Create aliases for admin menus with error handling
    try {
      console.log('Creating alias for admin menu 1...');
      await client
        .createRichMenuAlias(richMenuIds.admin1, 'admin-menu-1')
        .catch(async (error) => {
          if (error.response?.status === 400) {
            // If alias exists, try to delete and recreate
            console.log('Alias admin-menu-1 might exist, trying to delete...');
            await client.deleteRichMenuAlias('admin-menu-1').catch(() => {});
            await client.createRichMenuAlias(
              richMenuIds.admin1,
              'admin-menu-1',
            );
          } else {
            throw error;
          }
        });

      console.log('Creating alias for admin menu 2...');
      await client
        .createRichMenuAlias(richMenuIds.admin2, 'admin-menu-2')
        .catch(async (error) => {
          if (error.response?.status === 400) {
            // If alias exists, try to delete and recreate
            console.log('Alias admin-menu-2 might exist, trying to delete...');
            await client.deleteRichMenuAlias('admin-menu-2').catch(() => {});
            await client.createRichMenuAlias(
              richMenuIds.admin2,
              'admin-menu-2',
            );
          } else {
            throw error;
          }
        });
    } catch (aliasError: any) {
      console.error('Error creating aliases:', aliasError.message);
      console.error('Continuing with rich menu IDs...');
    }

    // Log all created rich menu IDs
    console.log('Successfully created rich menus. IDs:', {
      registerRichMenuId: richMenuIds.register,
      generalRichMenuId: richMenuIds.general,
      adminRichMenu1Id: richMenuIds.admin1,
      adminRichMenu2Id: richMenuIds.admin2,
      managerRichMenuId: richMenuIds.manager,
      driverRichMenuId: richMenuIds.driver,
    });

    // Save IDs to a file for reference
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const idsFilePath = path.resolve(
      __dirname,
      `../richmenu-ids-${timestamp}.json`,
    );
    fs.writeFileSync(idsFilePath, JSON.stringify(richMenuIds, null, 2));
    console.log(`Rich menu IDs saved to ${idsFilePath}`);
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

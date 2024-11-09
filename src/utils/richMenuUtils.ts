// utils/richMenuUtils.ts

import { Client } from '@line/bot-sdk';
import { UserRole } from '../types/enum';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

// Rich Menu IDs from the creation script
const RICH_MENU_IDS = {
  REGISTER: 'richmenu-fc12223f4021030d17f15e5538b53fbe',
  GENERAL: 'richmenu-70ea7b2b2962aa373f853fe8dd7ee089',
  ADMIN_1: 'richmenu-efc423abb330477551252d737db592b8',
  ADMIN_2: 'richmenu-064fa9593a85563e491ca5c0982107be',
  MANAGER: 'richmenu-15e254f3f5068fb8768a7b8345735ddd',
  DRIVER: 'richmenu-ec0c4c8ea88848e9f8bf9bc6be54989d',
};

export const createAndAssignRichMenu = async (
  departmentId: string | undefined,
  lineUserId: string,
  role: string,
): Promise<string | undefined> => {
  let richMenuId: string;

  switch (role) {
    case UserRole.GENERAL:
    case UserRole.SALES:
      richMenuId = RICH_MENU_IDS.GENERAL;
      break;
    case UserRole.ADMIN:
    case UserRole.SUPERADMIN:
      richMenuId = RICH_MENU_IDS.ADMIN_1;
      break;
    case UserRole.MANAGER:
      richMenuId = RICH_MENU_IDS.MANAGER;
      break;
    case UserRole.DRIVER:
      richMenuId = RICH_MENU_IDS.DRIVER;
      break;
    default:
      richMenuId = RICH_MENU_IDS.REGISTER;
  }

  try {
    await client.linkRichMenuToUser(lineUserId, richMenuId);
    console.log(`Rich menu ${richMenuId} linked to user ${lineUserId}`);
    return richMenuId;
  } catch (error) {
    console.error(`Error linking rich menu to user ${lineUserId}:`, error);
    return undefined;
  }
};

// Other utility functions remain the same

export const unlinkRichMenu = async (userId: string): Promise<void> => {
  try {
    await client.unlinkRichMenuFromUser(userId);
    console.log(`Rich menu unlinked from user ${userId}`);
  } catch (error) {
    console.error(`Error unlinking rich menu from user ${userId}:`, error);
    throw error;
  }
};

export const getRichMenuIdForUser = async (
  userId: string,
): Promise<string | null> => {
  try {
    const richMenuId = await client.getRichMenuIdOfUser(userId);
    return richMenuId;
  } catch (error) {
    console.error(`Error getting rich menu ID for user ${userId}:`, error);
    return null;
  }
};

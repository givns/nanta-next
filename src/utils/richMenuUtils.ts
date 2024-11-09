// utils/richMenuUtils.ts

import { Client } from '@line/bot-sdk';
import { UserRole } from '../types/enum';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

// Rich Menu IDs from the creation script
const RICH_MENU_IDS = {
  REGISTER: 'richmenu-b655539a9b6ce28f4b31ebea69d2d97d',
  GENERAL: 'richmenu-6f94c49ba3e1c5546b539ff0b22dd688',
  ADMIN_1: 'richmenu-edfb57723ea8309509bc8f7051fba0cc',
  ADMIN_2: 'richmenu-19cf97a8af92339b7f8e0640eab86648',
  MANAGER: 'richmenu-abca6847aa6dd7b7a7da31f112d45056',
  DRIVER: 'richmenu-2ac420dea0850acded18ed14844621db'
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

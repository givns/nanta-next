// utils/richMenuUtils.ts

import { Client } from '@line/bot-sdk';
import { UserRole } from '../types/enum';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const RICH_MENU_IDS = {
  REGISTER: 'richmenu-c876a2cb27d6c2e847adafc5aecdf167',
  GENERAL: 'richmenu-0c49940d4c951665c95813b58b8c0204',
  ADMIN_1: 'richmenu-53f23f26a3bae17b122930d4498f0e71',
  ADMIN_2: 'richmenu-bc9338a7922f1c704276b56575cf0f89',
  MANAGER: 'richmenu-6e25c0a34328fe96a8aa1c240801b040',
  DRIVER: 'richmenu-24796735f0e361ef584437e37e8d09bc',
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

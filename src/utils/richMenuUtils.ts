// utils/richMenuUtils.ts

import { Client } from '@line/bot-sdk';
import { UserRole } from '../types/enum';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export const createAndAssignRichMenu = async (
  department: string,
  userId: string,
  role: UserRole,
): Promise<string> => {
  let richMenuId: string;

  switch (role) {
    case UserRole.SUPERADMIN:
      richMenuId = 'richmenu-5e2677dc4e68d4fde747ff413a88264f'; // Super Admin Rich Menu
      break;
    case UserRole.ADMIN:
      richMenuId = 'richmenu-deec36bf2265338a9f48acd024ce1cde'; // Admin Rich Menu
      break;
    case UserRole.DRIVER:
      richMenuId = 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce'; // Placeholder for Route Rich Menu
      break;
    case UserRole.OPERATION:
      richMenuId = 'richmenu-834c002dbe1ccfbedb54a76b6c78bdde'; // Special User Rich Menu
      break;
    case UserRole.GENERAL:
    default:
      richMenuId = 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce'; // General User Rich Menu
  }

  try {
    await client.linkRichMenuToUser(userId, richMenuId);
    console.log(`Rich menu ${richMenuId} linked to user ${userId}`);
    return richMenuId;
  } catch (error) {
    console.error(`Error linking rich menu to user ${userId}:`, error);
    throw error;
  }
};

// You can add more rich menu related utilities here if needed

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

// Add any other rich menu related functions here

import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!LINE_CHANNEL_ACCESS_TOKEN) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN is not defined');
  process.exit(1);
}

interface RichMenu {
  richMenuId: string;
  name: string;
  size: {
    width: number;
    height: number;
  };
  chatBarText: string;
}

// Your existing code to list and delete rich menus
async function listRichMenus(): Promise<RichMenu[]> {
  try {
    const response = await axios.get<{ richmenus: RichMenu[] }>(
      'https://api.line.me/v2/bot/richmenu/list',
      {
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      },
    );

    // Access the richmenus array from the response
    const richMenus = response.data.richmenus;
    console.log(
      'Found rich menus:',
      richMenus.map((menu) => ({
        id: menu.richMenuId,
        name: menu.name,
      })),
    );
    return richMenus;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('No rich menus found');
      return [];
    }
    console.error(
      'Error listing rich menus:',
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function deleteRichMenu(richMenuId: string) {
  try {
    await axios.delete(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    console.log(`Rich menu with ID ${richMenuId} deleted successfully.`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log(`Rich menu with ID ${richMenuId} not found.`);
      return;
    }
    console.error(
      `Error deleting rich menu with ID ${richMenuId}:`,
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function deleteAllRichMenus() {
  try {
    const richMenus = await listRichMenus();
    if (richMenus.length === 0) {
      console.log('No rich menus to delete.');
      return;
    }

    console.log(`Found ${richMenus.length} rich menu(s) to delete.`);

    for (const richMenu of richMenus) {
      await deleteRichMenu(richMenu.richMenuId);
    }
    console.log('All rich menus deleted successfully.');
  } catch (error) {
    console.error('Error deleting all rich menus:', error);
  }
}

// Run the deletion
deleteAllRichMenus();

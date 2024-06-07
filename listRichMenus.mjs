import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!LINE_CHANNEL_ACCESS_TOKEN) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN is not defined');
  process.exit(1);
}

// Your existing code to list and delete rich menus
async function listRichMenus() {
  try {
    const response = await axios.get('https://api.line.me/v2/bot/richmenu/list', {
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    const richMenus = response.data.richmenus;
    console.log('Existing rich menus:', richMenus);
    return richMenus;
  } catch (error) {
    console.error('Error listing rich menus:', error.response?.data || error.message);
    throw error;
  }
}

listRichMenus();
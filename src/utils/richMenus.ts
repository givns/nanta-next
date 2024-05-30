import axios from 'axios';
import path from 'path';
import fs from 'fs';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN as string;
const LIFF_ID = process.env.LIFF_ID as string;

const createRichMenu = async (richMenu: any) => {
  try {
    const response = await axios.post('https://api.line.me/v2/bot/richmenu', richMenu, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const richMenuId = response.data.richMenuId;
    console.log('Rich menu created with ID:', richMenuId);
    return richMenuId;
  } catch (error: any) {
    console.error('Error creating rich menu:', error.response?.data || error.message);
    throw error;
  }
};

const uploadRichMenuImage = async (richMenuId: string, imagePath: string) => {
  try {
    const absolutePath = path.join(process.cwd(), imagePath);
    console.log('Absolute path of image:', absolutePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Image file does not exist at path: ${absolutePath}`);
    }

    const image = fs.readFileSync(absolutePath);
    console.log('Image file read successfully');

    const response = await axios.post(`https://api.line.me/v2/bot/richmenu/${richMenuId}/content`, image, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'image/jpeg'
      }
    });

    console.log('Image uploaded to rich menu:', richMenuId);
    return response.data;
  } catch (error: any) {
    console.error('Error uploading rich menu image:', error.response?.data || error.message);
    throw error;
  }
};

const linkRichMenuToUser = async (userId: string, richMenuId: string) => {
  try {
    await axios.post(`https://api.line.me/v2/bot/user/${userId}/richmenu/${richMenuId}`, {}, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    console.log(`Rich menu ${richMenuId} linked to user ${userId}`);
  } catch (error: any) {
    console.error('Error linking rich menu to user:', error.response?.data || error.message);
    throw error;
  }
};

// Define rich menu structures

const generalUserRichMenu = {
  size: {
    width: 2500,
    height: 1686
  },
  selected: true,
  name: "General User Menu",
  chatBarText: "Menu",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/holiday-calendar` } // Slot A
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/overtime-request` } // Slot B
    },
    {
      bounds: { x: 0, y: 843, width: 1250, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/leave-balance` } // Slot C
    },
    {
      bounds: { x: 1250, y: 843, width: 1250, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/leave-request` } // Slot D
    }
  ]
};

const specialUserRichMenu = {
  size: {
    width: 2500,
    height: 1686
  },
  selected: true,
  name: "Special User Menu",
  chatBarText: "Special Menu",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/check-in` } // Slot A (Check-in)
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/overtime-request` } // Slot B
    },
    {
      bounds: { x: 0, y: 843, width: 1250, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/leave-balance` } // Slot C
    },
    {
      bounds: { x: 1250, y: 843, width: 1250, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/leave-request` } // Slot D
    }
  ]
};

const adminRichMenu = {
  size: {
    width: 2500,
    height: 1686
  },
  selected: true,
  name: "Admin Menu",
  chatBarText: "Admin Menu",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/approval-dashboard` } // Slot A
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/holiday-calendar` } // Slot B
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/leave-balance` } // Slot C
    },
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/leave-request` } // Slot D
    }
  ]
};

const superAdminRichMenu = {
  size: {
    width: 2500,
    height: 1686
  },
  selected: true,
  name: "Super Admin Menu",
  chatBarText: "Super Admin",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/approval-dashboard` } // Slot A
    },
    {
      bounds: { x: 833, y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/approval-dashboard` } // Slot B
    },
    {
      bounds: { x: 1666, y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/admin-dashboard` } // Slot C
    },
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/holiday-calendar` } // Slot D
    },
    {
      bounds: { x: 833, y: 843, width: 833, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/leave-balance` } // Slot E
    },
    {
      bounds: { x: 1666, y: 843, width: 834, height: 843 },
      action: { type: "uri", uri: `line://app/${LIFF_ID}/leave-request` } // Slot F
    }
  ]
};

export { createRichMenu, uploadRichMenuImage, linkRichMenuToUser, generalUserRichMenu, specialUserRichMenu, adminRichMenu, superAdminRichMenu };
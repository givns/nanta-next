import { Client } from '@line/bot-sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import util from 'util';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
if (!channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN must be defined in .env.local');
}
const client = new Client({ channelAccessToken });
const LIFF_ID = process.env.LIFF_ID || '';
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
/**
 * Link a rich menu to a user
 * @param richMenuId - The ID of the rich menu to link
 * @param userId - The ID of the user to link the rich menu to
 */
const linkRichMenuToUser = async (richMenuId, userId) => {
    try {
        console.log(`Linking rich menu ${richMenuId} to user ${userId}`);
        await client.linkRichMenuToUser(userId, richMenuId);
        console.log(`Successfully linked rich menu ${richMenuId} to user ${userId}`);
    }
    catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error(`Error linking rich menu ${richMenuId} to user ${userId}:`, error.response.data);
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        }
        else {
            console.error(`Error linking rich menu ${richMenuId} to user ${userId}:`, error.message);
        }
        throw error;
    }
};
/**
 * Create and assign a rich menu based on the user's department
 * @param department - The department of the user
 * @param userId - The ID of the user
 */
const createAndAssignRichMenu = async (department, userId) => {
    let richMenu;
    let imagePath;
    if (department === 'Transport' || department === 'Management') {
        richMenu = specialUserRichMenu;
        imagePath = 'public/images/richmenus/Special.jpeg';
    }
    else if (department === 'Admin') {
        richMenu = adminRichMenu;
        imagePath = 'public/images/richmenus/Admin.jpeg';
    }
    else if (department === 'Super Admin') {
        richMenu = superAdminRichMenu;
        imagePath = 'public/images/richmenus/SuperAdmin.jpeg';
    }
    else {
        richMenu = generalUserRichMenu;
        imagePath = 'public/images/richmenus/General.jpeg';
    }
    try {
        // Create the rich menu
        const richMenuId = await client.createRichMenu(richMenu);
        console.log(`Rich menu created with ID: ${richMenuId}`);
        // Upload the rich menu image
        await uploadRichMenuImage(richMenuId, imagePath);
        // Link the rich menu to the user
        await linkRichMenuToUser(richMenuId, userId);
    }
    catch (error) {
        console.error('Error creating and assigning rich menu:', error);
        throw error;
    }
};
/**
 * Upload an image for a rich menu
 * @param richMenuId - The ID of the rich menu
 * @param imagePath - The path to the image file
 */
const uploadRichMenuImage = async (richMenuId, imagePath) => {
    const absolutePath = path.resolve(imagePath);
    console.log('Absolute path of image:', absolutePath);
    const fileExists = fs.existsSync(absolutePath);
    console.log('File exists:', fileExists);
    if (!fileExists) {
        throw new Error(`Image file does not exist at path: ${absolutePath}`);
    }
    const readFile = util.promisify(fs.readFile);
    const imageBuffer = await readFile(absolutePath);
    console.log('Read image buffer:', imageBuffer.length, 'bytes');
    try {
        const response = await axios.post(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, imageBuffer, {
            headers: {
                'Content-Type': 'image/jpeg',
                'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                'Content-Length': imageBuffer.length,
            },
        });
        console.log('Rich menu image upload response:', response.data);
    }
    catch (error) {
        console.error('Error uploading rich menu image:', error.response ? error.response.data : error.message);
        throw error;
    }
};
export { linkRichMenuToUser, createAndAssignRichMenu, uploadRichMenuImage };

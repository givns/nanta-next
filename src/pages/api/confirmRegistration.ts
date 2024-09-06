import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { Client } from '@line/bot-sdk';

const prisma = new PrismaClient();
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, lineUserId } = req.body;

  try {
    const user = await prisma.user.update({
      where: { employeeId },
      data: { isRegistrationComplete: true },
      include: { department: true },
    });

    // Assign Rich Menu based on user role
    const richMenuId = getRichMenuIdForRole(user.role);
    await lineClient.linkRichMenuToUser(lineUserId, richMenuId);

    // Send welcome message
    await sendWelcomeMessage(
      lineUserId,
      user.name,
      user.role,
      user.department.name,
    );

    res
      .status(200)
      .json({ success: true, message: 'Registration completed successfully' });
  } catch (error) {
    console.error('Error confirming registration:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

function getRichMenuIdForRole(role: string): string {
  switch (role) {
    case 'DRIVER':
      return process.env.RICH_MENU_DRIVER_ID!;
    case 'OPERATION':
      return process.env.RICH_MENU_OPERATION_ID!;
    case 'GENERAL':
      return process.env.RICH_MENU_GENERAL_ID!;
    case 'ADMIN':
      return process.env.RICH_MENU_ADMIN_ID!;
    default:
      return process.env.RICH_MENU_DEFAULT_ID!;
  }
}

async function sendWelcomeMessage(
  lineUserId: string,
  name: string,
  role: string,
  department: string,
) {
  let roleSpecificInfo = '';
  switch (role) {
    case 'DRIVER':
      roleSpecificInfo =
        'As a driver, you can access route information and delivery schedules.';
      break;
    case 'OPERATION':
      roleSpecificInfo =
        'As an operations staff, you can manage shifts and oversee daily activities.';
      break;
    case 'GENERAL':
      roleSpecificInfo =
        'As a general staff member, you can access company-wide information and resources.';
      break;
    case 'ADMIN':
      roleSpecificInfo =
        'As an admin, you have access to administrative functions and user management.';
      break;
  }

  await lineClient.pushMessage(lineUserId, {
    type: 'text',
    text: `Welcome, ${name}! Your registration for the ${department} department is complete. ${roleSpecificInfo}\n\nCheck the menu below for available functions. If you need help, please contact HR.`,
  });
}

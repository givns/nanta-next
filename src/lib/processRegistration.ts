// lib/processRegistration.ts

import { PrismaClient } from '@prisma/client';
import { Client } from '@line/bot-sdk';

export async function processRegistration(
  employeeId: string,
  lineUserId: string,
  profilePictureUrl: string,
  prisma: PrismaClient,
  lineClient: Client,
) {
  const user = await prisma.user.update({
    where: { employeeId },
    data: {
      lineUserId,
      profilePictureUrl,
      isRegistrationComplete: true,
    },
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
    user.department?.name ?? 'Unassigned',
    lineClient,
  );

  return {
    name: user.name,
    role: user.role,
    department: user.department?.name ?? 'Unassigned',
  };
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
  lineClient: Client,
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

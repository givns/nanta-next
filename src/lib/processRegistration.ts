// lib/processRegistration.ts

import { PrismaClient } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import { createAndAssignRichMenu } from '../utils/richMenuUtils';
import { UserRole } from '../types/enum';

// Helper function to convert string role to UserRole enum
function stringToUserRole(role: string): UserRole {
  switch (role.toUpperCase()) {
    case 'SUPERADMIN':
      return UserRole.SUPERADMIN;
    case 'MANAGER':
      return UserRole.MANAGER;
    case 'ADMIN':
      return UserRole.ADMIN;
    case 'SALES':
      return UserRole.SALES;
    case 'DRIVER':
      return UserRole.DRIVER;
    case 'EMPLOYEE':
    case 'GENERAL':
    default:
      return UserRole.GENERAL;
  }
}

export async function processRegistration(
  employeeId: string,
  lineUserId: string,
  profilePictureUrl: string,
  prisma: PrismaClient,
  lineClient: Client,
) {
  try {
    // Update user information
    const updatedUser = await prisma.user.update({
      where: { employeeId },
      data: {
        lineUserId,
        profilePictureUrl,
        isRegistrationComplete: 'Yes',
      },
    });

    // Fetch the user's department and role
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });

    if (!user) {
      throw new Error('User not found after update');
    }

    // Convert string role to UserRole enum
    const userRole = stringToUserRole(user.role);

    // Assign rich menu based on user's role and department
    const richMenuId = await createAndAssignRichMenu(
      user.department?.id,
      lineUserId,
      userRole,
    );

    // Send welcome message
    await lineClient.pushMessage(lineUserId, {
      type: 'text',
      text: `สวัสดี, ${updatedUser.name}! ระบบได้ลงทะเบียนพนักงานของคุณเรียบร้อยแล้ว.`,
    });

    return {
      user: updatedUser,
      richMenuAssigned: !!richMenuId,
    };
  } catch (error) {
    console.error('Error in processRegistration:', error);
    throw error;
  }
}

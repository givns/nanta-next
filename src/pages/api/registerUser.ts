// pages/api/registerUser.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { Client } from '@line/bot-sdk';
import { ExternalDbService } from '../../services/ExternalDbService';
import { UserRole } from '@/types/enum';
import { ShiftManagementService } from '../../services/ShiftManagementService';
import { ExternalCheckInData } from '../../types/user';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const externalDbService = new ExternalDbService();
const shiftManagementService = new ShiftManagementService();

function determineRole(department: string): UserRole {
  switch (department) {
    case 'ฝ่ายขนส่ง':
      return UserRole.DRIVER;
    case 'ฝ่ายปฏิบัติการ':
      return UserRole.OPERATION;
    default:
      return UserRole.GENERAL;
  }
}

function determineRichMenuId(role: UserRole): string {
  switch (role) {
    case UserRole.SUPERADMIN:
      return 'richmenu-5e2677dc4e68d4fde747ff413a88264f';
    case UserRole.DRIVER:
      return 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce';
    case UserRole.OPERATION:
      return 'richmenu-834c002dbe1ccfbedb54a76b6c78bdde';
    case UserRole.GENERAL:
    default:
      return 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce';
  }
}

async function alertAdmin(
  lineUserId: string,
  name: string,
  employeeId: string,
) {
  const message = `New user registration with no exact match:\nLineUserId: ${lineUserId}\nName: ${name}\nEmployee Number: ${employeeId}`;
  console.warn(message);

  try {
    await client.pushMessage(lineUserId, { type: 'text', text: message });
    console.log('Admin alert sent successfully');
  } catch (error) {
    console.error('Error sending admin alert:', error);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  console.log('Received data:', req.body);

  const {
    lineUserId,
    name,
    nickname,
    department,
    profilePictureUrl,
    employeeId,
  } = req.body;

  if (!lineUserId || !name || !nickname || !employeeId || !department) {
    console.log('Missing required fields:', {
      lineUserId,
      name,
      nickname,
      employeeId,
      department,
    });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Initialize shifts if they don't exist
    await shiftManagementService.initializeShifts();

    let user = await prisma.user.findUnique({ where: { lineUserId } });

    let externalUser: ExternalCheckInData | null = null;
    try {
      externalUser = await externalDbService.getLatestCheckIn(employeeId);
    } catch (error) {
      console.error('Error finding external user:', error);
    }

    let role: UserRole;

    const userCount = await prisma.user.count();
    if (userCount === 0) {
      role = UserRole.SUPERADMIN;
    } else if (externalUser) {
      role = determineRole(externalUser.user_depname || department);
    } else {
      role = determineRole(department);
      await alertAdmin(lineUserId, name, employeeId);
    }

    const userData = {
      lineUserId,
      name: externalUser
        ? `${externalUser.user_fname} ${externalUser.user_lname}`.trim()
        : name,
      nickname,
      department: externalUser?.user_depname || department,
      profilePictureUrl,
      role: role.toString(),
      employeeId: externalUser?.user_no || employeeId,
      overtimeHours: 0,
    };

    if (!user) {
      const defaultShift = await shiftManagementService.getDefaultShift(
        userData.department,
      );

      if (!defaultShift) {
        console.error(
          `No default shift found for department: ${userData.department}`,
        );
        throw new Error(
          `No default shift found for department: ${userData.department}`,
        );
      }

      console.log(`Assigning shift to new user:`, defaultShift);

      user = await prisma.user.create({
        data: {
          ...userData,
          shiftId: defaultShift.id,
        },
      });
      console.log('New user created:', user);
    } else {
      user = await prisma.user.update({
        where: { lineUserId },
        data: userData,
      });
      console.log('Existing user updated:', user);
    }

    const createdUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { assignedShift: true },
    });
    console.log('Created user with assigned shift:', createdUser);

    // Prepare the response data
    const responseData = {
      ...createdUser,
      assignedShift: createdUser?.assignedShift
        ? {
            id: createdUser.assignedShift.id,
            name: createdUser.assignedShift.name,
            startTime: createdUser.assignedShift.startTime,
            endTime: createdUser.assignedShift.endTime,
          }
        : null,
    };

    const richMenuId = determineRichMenuId(role);
    await client.linkRichMenuToUser(lineUserId, richMenuId);

    res.status(201).json({ success: true, data: responseData });
  } catch (error: any) {
    console.error('Error in registerUser:', error);
    if (error.code === 'P2002') {
      return res
        .status(400)
        .json({ success: false, error: 'User already exists' });
    }
    res
      .status(500)
      .json({ success: false, error: error.message, stack: error.stack });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

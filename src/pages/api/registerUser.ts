import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { Client } from '@line/bot-sdk';
import { query } from '../../utils/mysqlConnection';
import { UserRole } from '@/types/enum';
import { ShiftManagementService } from '../../services/ShiftManagementService';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const shiftManagementService = new ShiftManagementService();

interface ExternalUserData {
  user_no: string;
  name: string;
  department: string;
}

async function findExternalUser(
  employeeId: string,
): Promise<ExternalUserData | null> {
  console.log(`Searching for external user with employeeId: ${employeeId}`);

  try {
    const externalUsers: any[] = await query(
      'SELECT * FROM dt_user WHERE user_no = ?',
      [employeeId],
    );

    if (externalUsers.length > 0) {
      const user = externalUsers[0] as Record<string, unknown>;
      console.log('External user found. Columns:', Object.keys(user));

      const mappedUser: ExternalUserData = {
        user_no: (user.user_no as string) || '',
        name: `${(user.user_fname as string) || ''} ${(user.user_lname as string) || ''}`.trim(),
        department:
          (user.user_depname as string) || (user.user_dep as string) || '',
      };

      console.log('Mapped external user:', mappedUser);
      return mappedUser;
    } else {
      console.log('No external user found');
      return null;
    }
  } catch (error) {
    console.error('Error in findExternalUser:', error);
    return null;
  }
}

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
    let user = await prisma.user.findUnique({ where: { lineUserId } });

    let externalUser: ExternalUserData | null = null;
    try {
      externalUser = await findExternalUser(employeeId);
    } catch (error) {
      console.error('Error finding external user:', error);
    }

    let role: UserRole;

    const userCount = await prisma.user.count();
    if (userCount === 0) {
      role = UserRole.SUPERADMIN;
    } else if (externalUser) {
      role = determineRole(externalUser.department || department);
    } else {
      role = determineRole(department);
      await alertAdmin(lineUserId, name, employeeId);
    }

    const userData = {
      lineUserId,
      name: externalUser?.name || name,
      nickname,
      department: externalUser?.department || department,
      profilePictureUrl,
      role: role.toString(),
      employeeId,
      overtimeHours: 0,
    };

    if (!user) {
      // For new user creation, we need to assign a default shift first
      const defaultShift = await shiftManagementService.getDefaultShift(
        userData.department,
      );

      if (!defaultShift) {
        throw new Error('No default shift found for the given department');
      }

      user = await prisma.user.create({
        data: {
          ...userData,
          shiftId: defaultShift.id, // Assign the default shift
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

    // Fetch the complete user data including the assigned shift
    const finalUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { assignedShift: true },
    });

    // Prepare the response data
    const responseData = {
      ...finalUser,
      assignedShift: finalUser?.assignedShift
        ? {
            id: finalUser.assignedShift.id,
            name: finalUser.assignedShift.name,
            startTime: finalUser.assignedShift.startTime,
            endTime: finalUser.assignedShift.endTime,
          }
        : null,
    };

    res.status(201).json({ success: true, data: responseData });

    const richMenuId = determineRichMenuId(role);
    await client.linkRichMenuToUser(lineUserId, richMenuId);
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

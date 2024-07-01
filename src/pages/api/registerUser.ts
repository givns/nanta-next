import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { Client } from '@line/bot-sdk';
import { UserRole } from '../../types/user';
import { query } from '../../utils/mysqlConnection';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

interface ExternalUserData {
  user_no: string;
  name: string;
  department: string;
}

async function findExternalUser(
  name: string,
  employeeId: string,
): Promise<ExternalUserData | null> {
  console.log(
    `Searching for external user with name: ${name} and employeeId: ${employeeId}`,
  );

  try {
    let externalUsers: any[] = await query(
      'SELECT * FROM dt_user WHERE user_no = ?',
      [employeeId],
    );

    if (externalUsers.length === 0) {
      // If not found by user_no, try searching by name
      externalUsers = await query(
        'SELECT * FROM dt_user WHERE user_fname LIKE ? OR user_lname LIKE ?',
        [`%${name}%`, `%${name}%`],
      );
    }

    if (externalUsers.length > 0) {
      const user = externalUsers[0] as Record<string, unknown>;
      console.log('External user found. Columns:', Object.keys(user));

      // Map the found user to our expected structure
      const mappedUser: ExternalUserData = {
        user_no: (user.user_no as string) || '',
        name: `${(user.user_fname as string) || ''} ${(user.user_lname as string) || ''}`.trim(),
        department: (user.user_depname as string) || '',
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

  if (!lineUserId || !name || !nickname || !department || !employeeId) {
    console.log('Missing required fields:', {
      lineUserId,
      name,
      nickname,
      department,
      employeeId,
    });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    let user = await prisma.user.findUnique({ where: { lineUserId } });

    let externalUser: ExternalUserData | null = null;
    try {
      externalUser = await findExternalUser(name, employeeId);
    } catch (error) {
      console.error('Error finding external user:', error);
      // Continue with the registration process even if external user lookup fails
    }

    let role: UserRole;
    let finalEmployeeId: string;

    const userCount = await prisma.user.count();
    if (userCount === 0) {
      role = UserRole.SUPERADMIN;
      finalEmployeeId = employeeId || `ADMIN_${Date.now()}`;
    } else if (externalUser) {
      role = determineRole(externalUser.department);
      finalEmployeeId = externalUser.user_no;
    } else {
      role = determineRole(department);
      finalEmployeeId = employeeId || `TEMP_${Date.now()}`;
      await alertAdmin(lineUserId, name, employeeId);
    }

    if (!finalEmployeeId) {
      finalEmployeeId = `TEMP_${Date.now()}`;
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          lineUserId,
          name: externalUser && externalUser.name ? externalUser.name : name,
          nickname,
          department:
            externalUser && externalUser.department
              ? externalUser.department
              : department,
          profilePictureUrl,
          role,
          employeeId: finalEmployeeId,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { lineUserId },
        data: {
          name: externalUser && externalUser.name ? externalUser.name : name,
          nickname,
          department:
            externalUser && externalUser.department
              ? externalUser.department
              : department,
          profilePictureUrl,
          role,
          employeeId: finalEmployeeId,
        },
      });
    }

    const richMenuId = determineRichMenuId(role);
    await client.linkRichMenuToUser(lineUserId, richMenuId);

    res.status(201).json({ success: true, data: user });
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

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
  user_name: string;
  department: string;
  // other fields as needed
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const {
      lineUserId,
      name,
      nickname,
      department,
      profilePictureUrl,
      employeeId,
    } = req.body;

    console.log('Received data:', req.body);

    // Validate the required fields
    if (!lineUserId || !name || !nickname || !department || !employeeId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // Check if the user already exists in Prisma
      let user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      // Find user in external database
      const externalUser = await findExternalUser(name, employeeId);

      // Determine the role and rich menu ID
      let role: UserRole;
      let finalEmployeeId: string;

      // Check if this is the first user and assign super admin role
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        role = UserRole.SUPERADMIN;
        finalEmployeeId = employeeId || `ADMIN_${Date.now()}`;
      } else if (externalUser) {
        // Assign role based on department from external database
        role = determineRole(externalUser.department);
        finalEmployeeId = externalUser.user_no;
      } else {
        // Assign role based on provided department
        role = determineRole(department);
        finalEmployeeId = employeeId || `TEMP_${Date.now()}`;
        alertAdmin(lineUserId, name, employeeId);
      }
      // Ensure finalEmployeeId is never null or undefined
      if (!finalEmployeeId) {
        finalEmployeeId = `TEMP_${Date.now()}`;
      }

      // If user does not exist in Prisma, create a new one
      if (!user) {
        user = await prisma.user.create({
          data: {
            lineUserId,
            name: externalUser ? externalUser.user_name : name,
            nickname,
            department: externalUser ? externalUser.department : department,
            profilePictureUrl,
            role,
            employeeId: finalEmployeeId,
          },
        });
      } else {
        // Update the existing user
        user = await prisma.user.update({
          where: { lineUserId },
          data: {
            name: externalUser ? externalUser.user_name : name,
            nickname,
            department: externalUser ? externalUser.department : department,
            profilePictureUrl,
            role,
            employeeId: finalEmployeeId,
          },
        });
      }

      // Determine the appropriate rich menu based on role
      const richMenuId = determineRichMenuId(role);

      // Link the rich menu to the user
      await client.linkRichMenuToUser(lineUserId, richMenuId);

      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

// ... rest of the file (findExternalUser, determineRole, determineRichMenuId, alertAdmin functions) ...

async function findExternalUser(
  name: string,
  employeeNumber: string,
): Promise<ExternalUserData | null> {
  // First, try to find by employee number
  let externalUsers = await query<ExternalUserData>(
    'SELECT user_no, user_name, department FROM dt_user WHERE user_no = ?',
    [employeeNumber],
  );

  if (externalUsers.length === 0) {
    // If not found, try to find by name (using LIKE for partial match)
    externalUsers = await query<ExternalUserData>(
      'SELECT user_no, user_name, department FROM dt_user WHERE user_name LIKE ?',
      [`%${name}%`],
    );
  }

  return externalUsers.length > 0 ? externalUsers[0] : null;
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
      return 'richmenu-5e2677dc4e68d4fde747ff413a88264f'; // Super Admin Rich Menu
    case UserRole.DRIVER:
      return 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce'; // Placeholder for Route Rich Menu
    case UserRole.OPERATION:
      return 'richmenu-834c002dbe1ccfbedb54a76b6c78bdde'; // Special Rich Menu
    case UserRole.GENERAL:
    default:
      return 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce'; // General User Rich Menu
  }
}

function alertAdmin(lineUserId: string, name: string, employeeNumber: string) {
  // Implement your admin alerting mechanism here
  console.warn(
    `New user registration with no exact match: LineUserId: ${lineUserId}, Name: ${name}, Employee Number: ${employeeNumber}`,
  );
  // You might want to store these alerts in a database table for admin review
}

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { Client } from '@line/bot-sdk';
import { ExternalDbService } from '../../services/ExternalDbService';
import { UserRole } from '@/types/enum';
import { ShiftManagementService } from '../../services/ShiftManagementService';
import { ExternalCheckInData } from '../../types/user';
import {
  refreshShiftCache,
  getShiftByDepartmentId,
  getDefaultShift,
} from '../../lib/shiftCache';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const externalDbService = new ExternalDbService();
const shiftManagementService = new ShiftManagementService();

function determineRole(department: string, isFirstUser: boolean): UserRole {
  if (isFirstUser) {
    return UserRole.SUPERADMIN;
  }
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.time('registerUser');
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
    console.time('refreshShiftCache');
    await refreshShiftCache();
    console.timeEnd('refreshShiftCache');

    console.time('findUser');
    let user = await prisma.user.findUnique({ where: { lineUserId } });
    console.timeEnd('findUser');

    console.time('getExternalUser');
    let externalData: {
      checkIn: ExternalCheckInData | null;
      userInfo: any | null;
    } | null = null;
    try {
      externalData = await externalDbService.getLatestCheckIn(employeeId);
    } catch (error) {
      console.error('Error finding external user:', error);
    }
    console.timeEnd('getExternalUser');

    console.time('determineShift');
    let shift = null;
    if (externalData?.userInfo?.user_dep) {
      shift = await getShiftByDepartmentId(externalData.userInfo.user_dep);
    }
    if (!shift) {
      shift = await getDefaultShift(department);
    }
    if (!shift) {
      throw new Error(`No shift found for department: ${department}`);
    }
    console.timeEnd('determineShift');

    console.time('determineRole');
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    const role = determineRole(department, isFirstUser);
    console.timeEnd('determineRole');

    const constructName = (
      externalCheckIn: ExternalCheckInData | null | undefined,
      providedName: string,
    ): string => {
      if (
        externalCheckIn &&
        (externalCheckIn.user_fname || externalCheckIn.user_lname)
      ) {
        const parts = [
          externalCheckIn.user_fname,
          externalCheckIn.user_lname,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : providedName;
      }
      return providedName;
    };

    const userData = {
      lineUserId,
      name: constructName(externalData?.checkIn, name),
      nickname,
      department: externalData?.userInfo?.user_depname || department,
      profilePictureUrl,
      role: role.toString(),
      employeeId: externalData?.userInfo?.user_no || employeeId,
      externalEmployeeId: externalData?.userInfo?.user_serial?.toString(),
      overtimeHours: 0,
      shiftId: shift.id,
    };

    console.log('User data before saving:', userData);

    console.time('createOrUpdateUser');
    if (!user) {
      user = await prisma.user.create({ data: userData });
      console.log('New user created:', user);
    } else {
      user = await prisma.user.update({
        where: { lineUserId },
        data: userData,
      });
      console.log('Existing user updated:', user);
    }
    console.timeEnd('createOrUpdateUser');

    console.time('getFinalUser');
    const finalUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { assignedShift: true },
    });
    console.timeEnd('getFinalUser');

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
    console.log(
      'Department ID from external data:',
      externalData?.userInfo?.user_dep,
    );
    console.log('Department name:', department);
    console.log('Assigned shift:', shift);

    console.time('linkRichMenu');
    const richMenuId = determineRichMenuId(role);
    await client.linkRichMenuToUser(lineUserId, richMenuId);
    console.timeEnd('linkRichMenu');

    console.timeEnd('registerUser');
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

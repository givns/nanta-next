import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { Client } from '@line/bot-sdk';
import { ExternalDbService } from '../../services/ExternalDbService';
import {
  getDepartmentByNameFuzzy,
  refreshShiftCache,
} from '../../lib/shiftCache';
import { ShiftManagementService } from '../../services/ShiftManagementService';
import Queue from 'bull';
import { ExternalCheckInData } from '../../types/user';
import { determineRole, determineRichMenuId } from '../../utils/userUtils';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const externalDbService = new ExternalDbService();
const shiftManagementService = new ShiftManagementService();

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error('REDIS_URL is not defined in the environment variables');
}

const registrationQueue = new Queue('user-registration', REDIS_URL);

async function processRegistration(job: any) {
  console.log('Starting registration process for job:', job.id);
  const {
    lineUserId,
    employeeId,
    name,
    nickname,
    department,
    profilePictureUrl,
  } = job.data;

  try {
    await refreshShiftCache();

    let user = await prisma.user.findUnique({ where: { lineUserId } });

    let externalData: {
      checkIn: ExternalCheckInData | null;
      userInfo: any | null;
    } | null = null;
    try {
      externalData = await externalDbService.getLatestCheckIn(employeeId);
    } catch (error) {
      console.error('Error finding external user:', error);
    }

    let shift = null;
    if (externalData?.userInfo?.user_dep) {
      shift = await shiftManagementService.getShiftByDepartmentId(
        externalData.userInfo.user_dep,
      );
    }
    if (!shift) {
      shift = await shiftManagementService.getDefaultShift(department);
    }
    if (!shift) {
      throw new Error(`No shift found for department: ${department}`);
    }

    const matchedDepartment = getDepartmentByNameFuzzy(
      externalData?.userInfo?.user_depname || department,
    );
    if (!matchedDepartment) {
      throw new Error(
        `No matching department found: ${externalData?.userInfo?.user_depname || department}`,
      );
    }
    await shiftManagementService.createDepartmentIfNotExists(matchedDepartment);
    const departmentId =
      await shiftManagementService.getDepartmentId(matchedDepartment);
    if (!departmentId) {
      throw new Error(`Failed to get department ID for: ${matchedDepartment}`);
    }

    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    const role = determineRole(matchedDepartment, isFirstUser);

    const userData = {
      lineUserId,
      name: externalData?.userInfo?.user_lname || name,
      nickname,
      departmentId,
      profilePictureUrl,
      profilePictureExternal: externalData?.userInfo?.user_photo
        ? externalData.userInfo.user_photo.toString()
        : null,
      role: role.toString(),
      employeeId: externalData?.userInfo?.user_no || employeeId,
      externalEmployeeId: externalData?.userInfo?.user_serial?.toString(),
      overtimeHours: 0,
      shiftId: shift.id,
    };

    if (!user) {
      user = await prisma.user.create({
        data: userData,
      });
    } else {
      user = await prisma.user.update({
        where: { lineUserId },
        data: userData,
      });
    }

    const richMenuId = determineRichMenuId(role);
    await client.linkRichMenuToUser(lineUserId, richMenuId);

    console.log('Registration process completed successfully');
    return { success: true, userId: user.id };
  } catch (error) {
    console.error('Error in registration process:', error);
    throw error;
  }
}

registrationQueue.process(processRegistration);

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
    console.log('Adding job to queue...');
    const job = await registrationQueue.add({
      lineUserId,
      employeeId,
      name,
      nickname,
      department,
      profilePictureUrl,
    });
    console.log('Job added successfully, ID:', job.id);

    res.status(202).json({
      success: true,
      jobId: job.id,
      message: 'Registration job queued',
    });
  } catch (error: any) {
    console.error('Error in registration process:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

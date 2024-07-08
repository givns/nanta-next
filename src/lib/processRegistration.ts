import { Job } from 'bull';
import prisma from './prisma';
import { Client } from '@line/bot-sdk';
import { ExternalDbService } from '../services/ExternalDbService';
import { getDepartmentByNameFuzzy, refreshShiftCache } from './shiftCache';
import { ShiftManagementService } from '../services/ShiftManagementService';
import { ExternalCheckInData } from '../types/user';
import { determineRole, determineRichMenuId } from '../utils/userUtils';

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelAccessToken) {
  throw new Error(
    'LINE_CHANNEL_ACCESS_TOKEN is not set in the environment variables',
  );
}

const client = new Client({
  channelAccessToken: channelAccessToken,
});

const externalDbService = new ExternalDbService();
const shiftManagementService = new ShiftManagementService();

export async function processRegistration(
  job: Job<any>,
): Promise<{ success: boolean; userId: string }> {
  console.log('Starting registration process for job:', job.id);
  const {
    lineUserId,
    employeeId,
    name,
    nickname,
    department,
    profilePictureUrl,
  } = job.data;

  if (job.data.testData) {
    console.log('Processing test job:', job.data.testData);
    console.log('Test job timestamp:', job.data.timestamp);
    return { success: true, userId: 'Test job processed successfully' };
  }

  try {
    await job.progress(10);
    await refreshShiftCache();

    let user = await prisma.user.findUnique({ where: { lineUserId } });

    await job.progress(20);
    let externalData: {
      checkIn: ExternalCheckInData | null;
      userInfo: any | null;
    } | null = null;
    try {
      externalData = await externalDbService.getLatestCheckIn(employeeId);
    } catch (error) {
      console.error('Error finding external user:', error);
    }

    await job.progress(30);
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

    await job.progress(40);
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

    await job.progress(50);
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

    await job.progress(70);
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

    await job.progress(80);
    const richMenuId = determineRichMenuId(role);
    await client.linkRichMenuToUser(lineUserId, richMenuId);

    await job.progress(100);
    console.log('Registration process completed successfully');
    return { success: true, userId: user.id };
  } catch (error) {
    console.error('Error in registration process:', error);
    throw error;
  }
}

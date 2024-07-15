// lib/processRegistration.ts

import prisma from './prisma';
import { Client } from '@line/bot-sdk';
import { ExternalDbService } from '../services/ExternalDbService';
import { getDepartmentByNameFuzzy, refreshShiftCache } from './shiftCache';
import { ShiftManagementService } from '../services/ShiftManagementService';
import { ExternalCheckInData } from '../types/user';
import { determineRole, determineRichMenuId } from '../utils/userUtils';
import { Job } from 'bull';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const externalDbService = new ExternalDbService();
const shiftManagementService = new ShiftManagementService();

export async function processRegistration(
  job: Job,
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

  try {
    await refreshShiftCache();

    let user = await prisma.user.findUnique({ where: { lineUserId } });

    let externalData: {
      records: ExternalCheckInData[];
      userInfo: any | null;
    } | null = null;
    try {
      externalData =
        await externalDbService.getDailyAttendanceRecords(employeeId);
      console.log('External data:', JSON.stringify(externalData, null, 2));
    } catch (error) {
      console.error('Error finding external user:', error);
    }

    let shift = null;
    if (externalData?.userInfo?.user_dep) {
      console.log(
        `Attempting to get shift for department ID: ${externalData.userInfo.user_dep}`,
      );
      shift = await shiftManagementService.getShiftByDepartmentId(
        externalData.userInfo.user_dep,
      );
      console.log(
        `Shift from department ID: ${JSON.stringify(shift, null, 2)}`,
      );
    }
    if (!shift) {
      console.log(
        `No shift found by department ID, trying to get default shift for: ${department}`,
      );
      shift = await shiftManagementService.getDefaultShift(department);
      console.log(`Default shift: ${JSON.stringify(shift, null, 2)}`);
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
    const departmentId =
      await shiftManagementService.getDepartmentId(matchedDepartment);

    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    const role = determineRole(matchedDepartment, isFirstUser);

    const profilePictureExternalUrl = getProfilePictureExternalUrl(
      externalData?.userInfo?.user_photo,
    );

    const userData = {
      lineUserId,
      name: externalData?.userInfo?.user_lname || name,
      nickname,
      departmentId,
      profilePictureUrl,
      profilePictureExternal: profilePictureExternalUrl,
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
    await retry(
      async () => await client.linkRichMenuToUser(lineUserId, richMenuId),
      3,
    );

    console.log('Registration process completed successfully');
    return { success: true, userId: user.id };
  } catch (error) {
    console.error('Error in registration process:', error);
    throw error;
  }
}

function getProfilePictureExternalUrl(photo: number): string {
  // Logic to convert photo number to URL
  return `https://external-service-url.com/photos/${photo}`;
}

async function retry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        throw error;
      }
      console.warn(`Retrying... (${attempt}/${retries})`);
    }
  }
  throw new Error('Max retries reached');
}

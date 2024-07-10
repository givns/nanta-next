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
    await client.linkRichMenuToUser(lineUserId, richMenuId);

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

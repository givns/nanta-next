// lib/processRegistration.ts

import { Job } from 'bull';
import prisma from './prisma';
import { Client } from '@line/bot-sdk';
import { ExternalDbService } from '../services/ExternalDbService';
import { ShiftManagementService } from '../services/ShiftManagementService';
import { determineRole, determineRichMenuId } from '../utils/userUtils';
import {
  getShiftByDepartmentId,
  DepartmentId,
  getShiftByCode,
  getDepartmentIdByName,
  departmentIdNameMap,
} from './shiftCache';
import { Shift } from '@prisma/client';

interface ExternalUserInfo {
  user_serial: number | string;
  user_no: string;
  user_fname?: string;
  user_lname?: string;
  user_photo: string;
  department: string;
  user_depname: string;
  user_dep: string;
}

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

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
    // Initialize services
    await shiftManagementService.initialize();

    // Find existing user or prepare for new user creation
    let user = await prisma.user.findUnique({ where: { lineUserId } });

    // Fetch external data
    const externalDbService = new ExternalDbService();
    const externalData =
      await externalDbService.getDailyAttendanceRecords(employeeId);
    console.log('External data:', JSON.stringify(externalData, null, 2));

    // Determine department and shift
    let departmentId: string;
    let shift: Shift | null = null;

    if (externalData?.userInfo?.user_dep) {
      const externalDeptId = parseInt(externalData.userInfo.user_dep, 10);
      console.log(`External department ID: ${externalDeptId}`);

      // Use the departmentIdNameMap to get the department name
      const departmentName =
        departmentIdNameMap[externalDeptId as DepartmentId];

      if (!departmentName) {
        throw new Error(
          `No matching department found for external ID: ${externalDeptId}`,
        );
      }

      // Find the internal department
      const matchedDepartment = await prisma.department.findFirst({
        where: { name: departmentName },
      });

      if (!matchedDepartment) {
        throw new Error(
          `No matching internal department found for: ${departmentName}`,
        );
      }

      departmentId = matchedDepartment.id;
      shift = await getShiftByDepartmentId(externalDeptId as DepartmentId);
    } else {
      // If we don't have an external department ID, use the provided department name
      const matchedDepartment = await prisma.department.findFirst({
        where: { name: department },
      });

      if (!matchedDepartment) {
        throw new Error(`No matching department found: ${department}`);
      }

      departmentId = matchedDepartment.id;
      const deptId = getDepartmentIdByName(department);

      if (!deptId) {
        throw new Error(`No department ID found for department: ${department}`);
      }

      shift = await getShiftByDepartmentId(deptId);
    }

    // After this block, add a fallback for shift if it's still null
    if (!shift) {
      console.warn(`No shift found, using default shift`);
      shift = await getShiftByCode('SHIFT103'); // Use your default shift code
    }

    if (!shift) {
      throw new Error(`No shift found and default shift not available`);
    }
    // Determine user role
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    const role = determineRole(department, isFirstUser);

    const profilePictureExternal = externalData?.userInfo?.user_photo
      ? `https://external-service-url.com/photos/${externalData.userInfo.user_photo}`
      : null;

    // Prepare user data
    const userData = {
      lineUserId,
      name: externalData?.userInfo?.user_lname || name,
      nickname,
      departmentId,
      profilePictureUrl,
      profilePictureExternal,
      role: role.toString(),
      employeeId: externalData?.userInfo?.user_no || employeeId,
      externalEmployeeId: externalData?.userInfo?.user_serial?.toString(),
      overtimeHours: 0,
      shiftId: shift.id,
    };

    // Create or update user
    if (!user) {
      user = await prisma.user.create({ data: userData });
    } else {
      user = await prisma.user.update({
        where: { lineUserId },
        data: userData,
      });
    }

    // Link rich menu
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

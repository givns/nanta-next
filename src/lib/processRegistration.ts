// lib/processRegistration.ts

import { Job } from 'bull';
import prisma from './prisma';
import { Client } from '@line/bot-sdk';
import { ExternalDbService } from '../services/ExternalDbService';
import { determineRole, determineRichMenuId } from '../utils/userUtils';
import {
  getShiftByDepartmentId,
  DepartmentId,
  getShiftByCode,
  getDepartmentIdByName,
  departmentIdNameMap,
} from './shiftCache';
import { Shift, User } from '@prisma/client';
import { UserRole } from '@/types/enum';

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

const externalDbService = new ExternalDbService();

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
    let user = await prisma.user.findUnique({ where: { lineUserId } });

    const externalData =
      await externalDbService.getDailyAttendanceRecords(employeeId);
    console.log('External data:', JSON.stringify(externalData, null, 2));

    const { departmentId, shift } = await getDepartmentAndShift(
      externalData,
      department,
    );

    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    const role = determineRole(department, isFirstUser);

    const profilePictureExternal = externalData?.userInfo?.user_photo
      ? `https://external-service-url.com/photos/${externalData.userInfo.user_photo}`
      : null;

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

    user = await upsertUser(user, userData);

    await linkRichMenu(lineUserId, role);

    console.log('Registration process completed successfully');
    return { success: true, userId: user.id };
  } catch (error) {
    console.error('Error in registration process:', error);
    throw error;
  }
}

async function getDepartmentAndShift(
  externalData: any,
  department: string,
): Promise<{ departmentId: string; shift: Shift }> {
  let departmentId: string;
  let shift: Shift | null = null;

  if (externalData?.userInfo?.user_dep) {
    const externalDeptId = parseInt(externalData.userInfo.user_dep, 10);
    console.log(`External department ID: ${externalDeptId}`);

    shift = await getShiftByDepartmentId(externalDeptId as DepartmentId);
    console.log(
      `Shift found for external department ID ${externalDeptId}:`,
      shift,
    );

    const departmentName = departmentIdNameMap[externalDeptId as DepartmentId];
    if (!departmentName) {
      throw new Error(
        `No matching department found for external ID: ${externalDeptId}`,
      );
    }

    const internalDepartment = await prisma.department.upsert({
      where: { name: departmentName },
      update: {},
      create: { name: departmentName, externalId: externalDeptId },
    });

    departmentId = internalDepartment.id;
  } else {
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

  if (!shift) {
    console.warn(`No shift found, using default shift`);
    shift = await getShiftByCode('SHIFT103');
  }

  if (!shift) {
    throw new Error(`No shift found and default shift not available`);
  }

  return { departmentId, shift };
}

async function upsertUser(user: User | null, userData: any): Promise<User> {
  if (!user) {
    return await prisma.user.create({ data: userData });
  } else {
    return await prisma.user.update({
      where: { lineUserId: userData.lineUserId },
      data: userData,
    });
  }
}

async function linkRichMenu(lineUserId: string, role: UserRole): Promise<void> {
  const richMenuId = determineRichMenuId(role);
  await retry(
    async () => await client.linkRichMenuToUser(lineUserId, richMenuId),
    3,
  );
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

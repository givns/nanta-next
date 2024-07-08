import { Job } from 'bull';
import prisma from '../lib/prisma';
import { ExternalDbService } from '../services/ExternalDbService';
import { getDepartmentByNameFuzzy } from '../lib/shiftCache';
import { Client } from '@line/bot-sdk';
import { determineRole, determineRichMenuId } from '../utils/userUtils';
import { ShiftManagementService } from '../services/ShiftManagementService';

if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  throw new Error(
    'LINE_CHANNEL_ACCESS_TOKEN is not defined in environment variables',
  );
}

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const externalDbService = new ExternalDbService();
const shiftManagementService = new ShiftManagementService();

export default async function processRegistration(job: Job) {
  const {
    lineUserId,
    employeeId,
    name,
    nickname,
    department,
    profilePictureUrl,
  } = job.data;

  console.log('Job data:', {
    lineUserId,
    employeeId,
    name,
    nickname,
    department,
  });

  try {
    job.progress(10);
    await prisma.$connect();

    job.progress(20);
    const externalData = await externalDbService.getLatestCheckIn(employeeId);

    job.progress(30);
    const matchedDepartment = getDepartmentByNameFuzzy(
      externalData?.userInfo?.user_depname || department,
    );
    if (!matchedDepartment) {
      throw new Error(
        `No matching department found: ${externalData?.userInfo?.user_depname || department}`,
      );
    }

    job.progress(40);
    let shift = null;
    if (externalData?.userInfo?.user_dep) {
      shift = await shiftManagementService.getShiftByDepartmentId(
        externalData.userInfo.user_dep,
      );
    }
    if (!shift) {
      shift = await shiftManagementService.getDefaultShift(matchedDepartment);
    }
    if (!shift) {
      throw new Error(`No shift found for department: ${matchedDepartment}`);
    }

    job.progress(50);
    let departmentRecord = await prisma.department.findFirst({
      where: { name: { contains: matchedDepartment, mode: 'insensitive' } },
    });

    if (!departmentRecord) {
      departmentRecord = await prisma.department.create({
        data: { name: matchedDepartment },
      });
    }

    job.progress(60);
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    const role = determineRole(matchedDepartment, isFirstUser);

    job.progress(70);
    const userData = {
      lineUserId,
      name: externalData?.userInfo?.user_lname || name,
      nickname,
      departmentId: departmentRecord.id,
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

    job.progress(80);
    const user = await prisma.user.upsert({
      where: { lineUserId },
      update: userData,
      create: userData,
    });

    job.progress(90);
    try {
      const richMenuId = determineRichMenuId(role);
      await client.linkRichMenuToUser(lineUserId, richMenuId);
    } catch (error: any) {
      console.error('Error linking rich menu:', error);
      job.log(`Failed to link rich menu: ${error.message}`);
      // Decide if you want to throw this error or continue
    }

    job.progress(100);
    console.log('Registration process completed successfully');
    return { success: true, userId: user.id };
  } catch (error: any) {
    console.error('Error in registration process:', error);
    job.log(`Registration failed: ${error.message}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

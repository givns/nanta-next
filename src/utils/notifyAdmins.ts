// utils/notifyAdmins.ts
import { LeaveRequest, User } from '@prisma/client';
import prisma from './db';
import { sendLeaveRequestNotification } from './sendLeaveRequestNotification';

export const notifyAdmins = async (leaveRequest: LeaveRequest) => {
  const admins = await prisma.user.findMany({
    where: {
      OR: [{ role: 'admin' }, { role: 'superadmin' }],
    },
  });

  for (const admin of admins) {
    await sendLeaveRequestNotification(admin, leaveRequest);
  }
};

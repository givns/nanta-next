// jobs/sendOvertimeDigests.ts

import { PrismaClient } from '@prisma/client';
import { OvertimeServiceServer } from '../services/OvertimeServiceServer';
import { TimeEntryService } from '../services/TimeEntryService';
import { ShiftManagementService } from '../services/ShiftManagementService';
import { createNotificationService } from '@/services/NotificationService';

const prisma = new PrismaClient();
export const notificationService = createNotificationService(prisma);
const shiftManagementService = new ShiftManagementService(prisma);
const timeEntryService = new TimeEntryService(prisma, shiftManagementService);
const overtimeService = new OvertimeServiceServer(
  prisma,
  timeEntryService,
  notificationService,
);

export async function sendOvertimeDigests() {
  const managers = await prisma.user.findMany({ where: { role: 'MANAGER' } });
  const pendingRequests = await overtimeService.getPendingOvertimeRequests();

  for (const manager of managers) {
    if (manager.lineUserId) {
      await notificationService.sendOvertimeDigest(
        manager.lineUserId,
        pendingRequests,
      );
    }
  }
}

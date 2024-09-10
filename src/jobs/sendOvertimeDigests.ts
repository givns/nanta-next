// jobs/sendOvertimeDigests.ts

import { PrismaClient } from '@prisma/client';
import { OvertimeNotificationService } from '../services/OvertimeNotificationService';
import { OvertimeServiceServer } from '../services/OvertimeServiceServer';
import { TimeEntryService } from '../services/TimeEntryService'; // Add this import

const prisma = new PrismaClient();
const notificationService = new OvertimeNotificationService();
const timeEntryService = new TimeEntryService(prisma); // Pass the prisma instance as an argument

const overtimeService = new OvertimeServiceServer(
  prisma,
  notificationService,
  timeEntryService,
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

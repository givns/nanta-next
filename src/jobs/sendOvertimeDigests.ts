// jobs/sendOvertimeDigests.ts

import { PrismaClient } from '@prisma/client';
import { OvertimeNotificationService } from '../services/OvertimeNotificationService';
import { OvertimeServiceServer } from '../services/OvertimeServiceServer';

const prisma = new PrismaClient();
const notificationService = new OvertimeNotificationService();
const overtimeService = new OvertimeServiceServer();

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

// services/AttendanceSyncService.ts

import { PrismaClient, User } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import { AttendanceService } from './AttendanceService';
import { NotificationService } from './NotificationService';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const attendanceService = new AttendanceService();
const notificationService = new NotificationService();

export class AttendanceSyncService {
  async syncAttendanceData() {
    const users = await prisma.user.findMany({
      where: { employeeId: { not: '' } },
      include: { assignedShift: true },
    });

    for (const user of users) {
      await this.syncUserAttendance(user);
    }
  }

  async syncUserAttendance(user: User & { assignedShift: any }) {
    try {
      const { records, userInfo } =
        await externalDbService.getDailyAttendanceRecords(user.employeeId);

      if (!userInfo) {
        console.error(
          `User info not found for employee ID: ${user.employeeId}`,
        );
        return;
      }

      for (const record of records) {
        const existingAttendance = await prisma.attendance.findFirst({
          where: {
            userId: user.id,
            date: new Date(record.date),
            OR: [
              { checkInTime: new Date(record.sj) },
              { checkOutTime: new Date(record.sj) },
            ],
          },
        });

        if (!existingAttendance) {
          const attendance = await attendanceService.processExternalCheckInOut(
            record,
            userInfo,
            user.assignedShift,
          );

          const message = this.createNotificationMessage(record, attendance);
          if (user.lineUserId) {
            await notificationService.sendNotification(
              user.id,
              message,
              user.lineUserId,
            );
          } else {
            console.error(
              `User ${user.id} does not have a LINE user ID for notifications`,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `Error syncing attendance for user ${user.employeeId}:`,
        error,
      );
    }
  }

  private createNotificationMessage(record: any, attendance: any): string {
    const time = new Date(record.sj).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    let action: string;

    switch (record.fx) {
      case 0:
        action = 'เข้างาน';
        break;
      case 1:
        action = 'ออกงาน';
        break;
      case 3:
        action = 'เริ่มทำงานล่วงเวลา';
        break;
      case 4:
        action = 'สิ้นสุดทำงานล่วงเวลา';
        break;
      default:
        action = 'บันทึกเวลา';
    }

    return `บันทึกเวลา${action}เรียบร้อยแล้ว: ${time}`;
  }
}

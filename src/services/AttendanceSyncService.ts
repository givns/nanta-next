// services/AttendanceSyncService.ts

import { PrismaClient, User, Shift } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import { AttendanceService } from './AttendanceService';
import { NotificationService } from './NotificationService';
import moment from 'moment-timezone';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const attendanceService = new AttendanceService();
const notificationService = new NotificationService();

export class AttendanceSyncService {
  async syncAttendanceData(syncType: string = 'regular') {
    console.log(`Starting ${syncType} attendance sync`);
    const users = await prisma.user.findMany({
      where: { employeeId: { not: '' } },
      include: { assignedShift: true },
    });

    for (const user of users) {
      await this.syncUserAttendance(user, syncType);
    }
    console.log(`${syncType} attendance sync completed`);
  }

  async syncUserAttendance(
    user: User & { assignedShift: Shift },
    syncType: string,
  ) {
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
        const existingAttendance = await this.findExistingAttendance(
          user.id,
          new Date(record.sj),
        );

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

  async checkUnclosedOvertimeSessions(): Promise<void> {
    const currentTime = new Date();
    const fifteenMinutesAgo = new Date(currentTime.getTime() - 15 * 60000);

    const unclosedSessions = await prisma.overtimeRequest.findMany({
      where: {
        status: 'APPROVED',
        endTime: {
          gte: fifteenMinutesAgo.toISOString(),
          lte: currentTime.toISOString(),
        },
        user: {
          attendances: {
            none: {
              checkOutTime: { not: null },
              date: {
                gte: fifteenMinutesAgo,
                lte: currentTime,
              },
            },
          },
        },
      },
      include: { user: true },
    });

    for (const session of unclosedSessions) {
      await notificationService.sendNotification(
        session.userId,
        `Your overtime session is ending soon. Please remember to check out.`,
      );
    }
  }

  private async findExistingAttendance(userId: string, date: Date) {
    return prisma.attendance.findFirst({
      where: {
        userId,
        date: {
          gte: moment(date).startOf('day').toDate(),
          lt: moment(date).endOf('day').toDate(),
        },
        OR: [{ checkInTime: date }, { checkOutTime: date }],
      },
    });
  }

  private createNotificationMessage(record: any, attendance: any): string {
    const time = new Date(record.sj).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    let action: string;

    switch (record.fx) {
      case 0:
        action = 'บันทึกเวลา';
        break;
      case 1:
        action = 'เข้างาน';
        break;
      case 2:
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
